## Context

O piloto está construído, testado (114 testes) e rodando em container na VPS, com o
banco de produção **vazio** — chip ainda não pareado, nenhum usuário real cadastrado.
Verificado dentro do volume `tars_data`: `usuarios 0`, `remedios 0`,
`gatilhos_configurados 0`, `contadores 0`, `despejos_semana 0`,
`historico_interacoes 0`.

`src/dashboard/` hoje são dois arquivos: `queries.js` (uma função, `resumoPiloto`) e
`server.js` (uma rota `/`, uma `/health`, e `renderizar` montando HTML por template
string). Sem autenticação de aplicação, sem escrita, sem roteamento.

Restrições herdadas que esta mudança **não** relaxa:

- Nomes de coluna são contrato entre módulos (spec `armazenamento`).
- `historico_interacoes` é append-only.
- `SEM_INFORMACAO` é constante de um lugar só (Regra 1b).
- O dashboard é alcançável apenas pelo loopback do host.
- Sem JavaScript de cliente; tudo server-rendered.
- Nada de biblioteca de gráfico — são 5 pessoas.

## Goals / Non-Goals

**Goals:**

- Tirar a operação do piloto do `docker compose exec` + SQL manual.
- Deixar rastro de toda escrita sobre dado de saúde.
- Permitir reparear o WhatsApp sem abrir SSH.
- Não aumentar a superfície exposta: mesma porta, mesmo bind, mesmo processo.

**Non-Goals:**

- Multi-usuário, papéis, permissões granulares.
- Recuperação de senha, 2FA, expiração de senha.
- Qualquer JavaScript de cliente.
- API JSON para consumo externo — as rotas servem HTML para um humano.
- Exclusão física de participante (ver Decisões).

## Decisions

### Aceitas de partida (definidas pelo dono do projeto)

**Evoluir `src/dashboard/`, não criar serviço novo.** Mesmo processo Express, mesma
porta, mesmo bind. Aceito, e coerente com o repositório: o projeto já rejeitou
complexidade equivalente em outros pontos (SQLite em vez de vetorial, tabela HTML em
vez de lib de gráfico). Um segundo serviço significaria segundo container, segunda
porta, segundo ponto de bind a errar — para uma pessoa operando cinco.

Consequência que assumo junto: `server.js` hoje tem ~150 linhas e vira a casa de
autenticação, listagem, detalhe, ~10 rotas de escrita e as telas de confirmação. Isso
passa de 1000 linhas com folga, o que o padrão de qualidade do repositório trata como
blocker presumido. Por isso a implementação **decompõe** o módulo:
`admin/rotas/*.js` por área, `admin/views/*.js` para render, `admin/auth.js`. O
"não criar serviço novo" é sobre processo e porta, não sobre manter tudo num arquivo.

**Autenticação por senha única + sessão em cookie assinado.** Aceito. É um admin de
um operador; framework de auth com tabela de usuários, hash por usuário e fluxo de
recuperação seria peso morto. Duas exigências que não são negociáveis dentro dessa
escolha: comparação de senha em tempo constante (`crypto.timingSafeEqual`, nunca
`===`, que vaza o tamanho do prefixo correto por timing) e cookie `HttpOnly`,
`SameSite=Strict`, com `Secure` quando servido sobre HTTPS.

Observação de contexto que muda a leitura do enunciado: **já existe** uma camada de
Basic Auth no Apache (`public_html/.htaccess` + `.htpasswd`), montada quando o
dashboard foi publicado em `tdah.xiax.com.br`. Ela **não está no Git** (`public_html/`
é gitignored) e vive fora da aplicação. A autenticação desta proposta não a substitui
nem a torna redundante: é a camada que viaja com o código, se replica num clone e
protege também quem acessar por túnel SSH — caminho que o `.htaccess` não cobre.

### (a) Migração de schema

Três mudanças: coluna `pausado INTEGER NOT NULL DEFAULT 0` em `usuarios`, valor
`'acao_admin'` no CHECK de `historico_interacoes.tipo`, e a tabela `estado_conexao`.

SQLite **não** altera CHECK constraint por `ALTER TABLE`. A migração segura é a
sequência tabela-nova → copiar → dropar → renomear, dentro de uma transação, com
`PRAGMA foreign_keys=OFF` durante o processo (senão o `DROP` da tabela antiga dispara
o CASCADE sobre as filhas).

**Decisão: o banco de produção está vazio, então a migração cuidadosa não se paga
agora.** O caminho é editar `schema.sql` direto — ele usa `CREATE TABLE IF NOT EXISTS`,
então basta recriar o arquivo `.sqlite`, e não há dado para perder. Isso mantém
`schema.sql` como fonte única do estado atual, sem um script de migração que nunca
seria exercitado contra dado real.

Duas travas para isso não virar armadilha depois:

1. O procedimento de recriação fica documentado no commit e no README.
2. Antes de rodar em produção, conferir de novo que o banco está vazio — não confiar
   nesta verificação, que tem data. Se houver qualquer linha em `usuarios`, o caminho
   passa a ser o script de migração transacional descrito acima, e não a recriação.

### (b) Handoff bot ↔ admin para QR e status de conexão

`tars` e `dashboard` são containers separados que compartilham **apenas** o volume
`tars_data`. Não há memória, socket nem evento em comum. O QR hoje nasce no handler de
`connection.update` de `src/whatsapp/connection.js`, vai para `qrcode.generate()` e
morre — não é persistido.

**Decisão: tabela de linha única no próprio SQLite.** Arquivo solto no volume seria
mais simples de escrever e pior de operar: sem tipo, sem transação, sem o mesmo
mecanismo de leitura que todo o resto usa, e com escrita parcial visível para o leitor.
O projeto já escolheu armazenamento estruturado; um `.json` ao lado do banco seria
drift arquitetural.

```sql
CREATE TABLE IF NOT EXISTS estado_conexao (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),  -- linha única
  conectado          INTEGER NOT NULL DEFAULT 0,
  qr_atual           TEXT,
  motivo_desconexao  TEXT,
  atualizado_em      TEXT NOT NULL
);
```

O `CHECK (id = 1)` é o que garante linha única no banco, não na convenção. A escrita é
upsert por `id = 1`.

Transições que o bot grava, no mesmo handler que já existe (é um
`db.prepare(...).run(...)` a mais, sem tocar na lógica de reconexão):

| Evento | `conectado` | `qr_atual` | `motivo_desconexao` |
|---|---|---|---|
| `qr` recebido | 0 | o QR bruto | `null` |
| `connection === 'open'` | 1 | `null` | `null` |
| `connection === 'close'` | 0 | `null` | o motivo, com destaque para logout |

O QR bruto é guardado, não a imagem: quem renderiza é o admin, e guardar texto mantém
a tabela pequena e legível.

**Frescor.** O QR do WhatsApp expira em ~20s. `atualizado_em` permite ao admin dizer
"este QR tem 4 segundos" em vez de mostrar um QR morto como se fosse válido. Um QR com
mais de 60 segundos é tratado como expirado e a página diz isso, em vez de exibi-lo.

### (c) Saída do piloto: anonimizar, não excluir

**Decisão do dono do projeto, tomada em resposta à pergunta obrigatória: anonimizar.**

`historico_interacoes.usuario_id` tem `ON DELETE CASCADE`. Excluir o usuário levaria
junto remédios, gatilhos, contadores, despejos e todo o histórico — inclusive o
registro de consentimento com timestamp e versão, e o rastro das ações de admin sobre
o dado daquela pessoa. Perder-se-ia exatamente a prova que uma fiscalização pede.

A anonimização substitui o que identifica e preserva a estrutura:

- `numero_whatsapp` → `redigido:<usuario_id>` (mantém a unicidade da coluna e impede
  que o mesmo número seja reconvidado por engano acreditando ser alguém novo).
- Todos os campos de `CAMPOS_ANAMNESE` → `[redigido]`.
- `remedios.nome` e `remedios.horario` → `[redigido]`. Não `SEM_INFORMACAO`: aquele
  sentinela significa "a pessoa não informou", e afirmar isso sobre alguém que
  informou seria falsear o dado. São coisas diferentes e precisam de marcadores
  diferentes.
- **`historico_interacoes.texto` → `[redigido]` para as linhas daquele usuário.** Esta
  é a parte que não estava no enunciado e sem a qual a anonimização seria fachada: o
  texto guarda as respostas da anamnese e as conversas, escritas pela própria pessoa,
  e frequentemente contêm nome, nomes de terceiros e detalhes de saúde.
- `pausado = 1`, todos os gatilhos desativados.
- `tipo`, `timestamp` e `gatilho_relacionado` do histórico **permanecem** — é o que
  sustenta a auditoria sem identificar ninguém.

Isto é a única exceção ao append-only de `historico_interacoes`, e é deliberada: um
`UPDATE` que apaga conteúdo identificável preserva mais do que um `DELETE` que apaga a
linha inteira. A própria anonimização é registrada como `acao_admin`.

### Pausar: filtro na query, não campo calculado

`pausado` entra como filtro em `listarGatilhosAtivos`, junto do `anamnese_estado = 12`
que já existe. A alternativa — desativar cada gatilho ao pausar e reativar ao
despausar — perde informação: não dá para distinguir "estava desativado porque o
operador desligou" de "foi desativado pela pausa", e despausar restauraria estado
errado. Um filtro é reversível por construção.

### Convidar × reiniciar: duas ações, públicos disjuntos

`convidarPiloto()` chama `setAnamneseEstado(id, 0)` incondicionalmente. Usá-lo como
"reenviar convite" genérico zeraria o progresso de quem está no meio da anamnese, sem
aviso. As duas ações passam a ser:

- **Convidar** — só oferecido para número inexistente, ou existente em
  `anamnese_estado === 0 && !consentimento_aceito`. Nesse recorte `convidarPiloto` é
  seguro, porque não há progresso a perder.
- **Reiniciar anamnese** — ação destrutiva explícita, para qualquer usuário, atrás de
  tela de confirmação. **Não** reaproveita `convidarPiloto`: ganha
  `reiniciarAnamnese()` própria em `userRepo.js`, que limpa os campos de resposta,
  remove os remédios e os gatilhos, além de zerar o estado. Reaproveitar deixaria
  resposta velha em campo que a nova anamnese talvez não regrave — um estado
  meio-antigo meio-novo, pior que qualquer um dos dois.

### Confirmação em duas etapas

Sem JavaScript de cliente não há `confirm()`. Toda ação destrutiva (reiniciar
anamnese, anonimizar, remover remédio) passa por uma página intermediária que diz o
que vai acontecer, em GET, e só então um POST. O GET não muda nada — o que também
significa que recarregar a página de confirmação é inofensivo.

## Risks / Trade-offs

**Sessão em memória do processo.** Reiniciar o container desloga o operador. Aceito:
é um login por senha única; relogar custa segundos. A alternativa (sessão no SQLite)
adicionaria tabela e limpeza de expirados para resolver um incômodo que não existe
nessa escala.

**Senha única, sem rate limiting na aplicação.** A superfície é loopback + Apache, e
o Apache já tem sua própria camada. Rate limiting na aplicação fica fora de escopo,
mas registro: se algum dia o admin for exposto sem o Apache na frente, isso vira
necessário.

**O admin escreve no mesmo banco que o bot lê.** Dois processos, um arquivo SQLite.
WAL já está habilitado e suporta um escritor com múltiplos leitores; agora passam a
ser **dois escritores**. O risco real é `SQLITE_BUSY` sob escrita concorrente. Na
escala do piloto — um operador clicando, um bot escrevendo algumas linhas por dia — a
janela é desprezível, mas a mitigação é barata e vale fazer: `PRAGMA busy_timeout` na
abertura da conexão.

**Recriar o schema apaga o banco.** O caminho simples só é seguro enquanto o banco
estiver vazio. A trava é conferir antes de rodar, não confiar na verificação de hoje.

**A anonimização é irreversível e não tem desfazer.** É o ponto dela. A tela de
confirmação precisa dizer isso com todas as letras, e a ação fica separada das demais
na interface para não ser clicada por proximidade.

**Uma tela do admin exibe o histórico completo de conversas.** É o dado mais sensível
do sistema reunido em uma página. Justifica-se pela operação — é o que permite
entender por que alguém sumiu — mas é exatamente por causa dela que a autenticação
desta proposta não é opcional.
