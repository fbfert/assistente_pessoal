## Why

O piloto vai ao ar com 5 pessoas e uma superfície de operação que hoje é
`docker compose exec` mais SQL direto no banco. Isso funciona no dia da instalação e
falha na semana 2, por três motivos concretos que já estão documentados no próprio
projeto:

- **Correção de anamnese é manual no banco** — decisão registrada e aceita no
  `design.md` do piloto. Aceita porque parsear correção automaticamente é caro; não
  porque abrir o SQLite com `sqlite3` seja um bom fluxo. Hoje o operador precisa
  escrever `UPDATE` à mão sobre dado de saúde, sem rastro e sem validação.
- **Ligar o `checklist_fim_dia` exige `UPDATE` direto.** Ele nasce com `ativo = 0` por
  decisão de produto, e "ativação é decisão manual" — mas não existe superfície para
  essa decisão manual acontecer.
- **O QR de pareamento só existe em `docker compose logs -f tars`.** Se a sessão cair
  às 23h de um sábado, reconectar exige SSH.

O dashboard atual (`src/dashboard/`) já responde metade da pergunta: ele **mostra**
quem está sumindo. Não responde a outra metade: **fazer alguma coisa a respeito**.

Há também uma lacuna de auditoria que só aparece quando a operação vira escrita. Hoje
qualquer edição de dado de saúde feita pelo operador não deixa rastro nenhum. Num
piloto que coleta consentimento formal com timestamp e versão, o registro de quem
mexeu no dado depois é parte da mesma obrigação.

## What Changes

Evolução de `src/dashboard/` — de superfície de leitura para superfície de operação.
Nenhum serviço novo, nenhuma porta nova.

- **Autenticação de aplicação** por senha única, com sessão em cookie assinado. Hoje a
  proteção é só o bind em loopback; ação de escrita sobre dado de saúde pede uma
  segunda camada que viaje junto com o código.
- **Página de detalhe por usuário**, com todos os campos da anamnese, remédios,
  gatilhos e o histórico completo de interações — a conversa real da pessoa com o bot.
- **Listas por status de esteira** (pendente de consentimento / consentiu sem concluir
  / concluiu), não apenas o número no totalizador.
- **Ações de escrita**: convidar piloto novo, reiniciar anamnese, editar campo de
  anamnese, editar e remover remédio, ativar/desativar gatilho e mudar horário, zerar
  contador de silêncio, pausar/despausar usuário, anonimizar participante.
- **Status de conexão e QR de pareamento pela web**, com o bot publicando o estado em
  tabela própria e o admin lendo do volume compartilhado.
- **Auditoria append-only** de toda ação de escrita, no mesmo `historico_interacoes`
  que o resto do projeto já usa.
- **Três mudanças de schema**: coluna `pausado`, tipo `acao_admin` no CHECK de
  `historico_interacoes`, tabela `estado_conexao`.

## Capabilities

### New Capabilities

- `admin-autenticacao`: senha única de operador, sessão por cookie assinado e o
  middleware que protege as rotas de escrita.
- `admin-operacao`: as ações de escrita do operador sobre usuário, anamnese, remédio,
  gatilho, contador e participação no piloto.
- `admin-auditoria`: registro append-only de toda ação de escrita do operador.
- `estado-conexao`: publicação, pelo bot, do status da conexão WhatsApp e do QR
  pendente, e sua leitura pelo admin.

### Modified Capabilities

- `dashboard-piloto`: deixa de ser superfície somente-leitura sem autenticação. Ganha
  exigência de autenticação, listas por status de esteira e a página de detalhe por
  usuário. A garantia de exposição apenas por loopback permanece inalterada.
- `armazenamento`: coluna `pausado` em `usuarios`, novo valor `acao_admin` no CHECK de
  `historico_interacoes.tipo`, e a tabela `estado_conexao`. Inclui também a regra de
  anonimização, que altera o que "sair do piloto" significa para os dados.
- `gatilhos`: usuário pausado deixa de receber disparo, sem que seus gatilhos sejam
  desativados individualmente.

## Impact

- **Código:** `src/dashboard/` (reescrito de um arquivo para vários), `src/db/schema.sql`,
  `src/db/userRepo.js`, `src/db/estadoConexaoRepo.js` (novo), `src/whatsapp/connection.js`
  (grava estado), `src/config.js`, `test/`.
- **Dependências novas:** `cookie-signature` (ou `express-session`) e `qrcode` — este
  último porque `qrcode-terminal`, já presente, só gera ASCII para terminal e não serve
  para `<img>`.
- **Variáveis de ambiente:** `ADMIN_PASSWORD` (nova, obrigatória para o admin subir).
- **Schema:** três mudanças. O banco de produção está vazio (verificado: 0 linhas em
  todas as tabelas), o que permite o caminho simples — ver `design.md`.
- **Dado sensível:** a superfície passa a **exibir** o histórico completo de conversas e
  a **permitir escrita** sobre dado de saúde. É o que motiva a autenticação e a
  auditoria desta mesma proposta.
- **Fora de escopo:** múltiplos operadores, papéis/permissões, recuperação de senha,
  qualquer JavaScript de cliente.
