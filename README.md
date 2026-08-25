# TARS piloto

Assistente pessoal por WhatsApp para pessoas neurodivergentes (TDAH/autismo).
Piloto de validação com **5 pessoas**, antes de virar produto.

**Não é terapeuta.** É guia diário de rotina — remédios, tarefas, sono — com uma
personalidade configurável. Não dá diagnóstico, não julga atraso, e nunca inventa
dado de saúde.

---

## Pré-requisitos do servidor

- **Docker** e **Docker Compose** (v2, o subcomando `docker compose`).
- Um **chip físico dedicado** com um número de WhatsApp **separado** do que você
  já usa em produção. O WhatsApp rejeita número virtual/VoIP no registro — não
  adianta tentar.
- Chave de API de pelo menos um provedor de LLM (Anthropic, OpenAI ou DeepSeek).
- Chave da **OpenAI** se quiser transcrição de áudio (é sempre a OpenAI, mesmo
  que o LLM de conversa seja outro).
- Para rodar os testes localmente, **Node.js 22+** e toolchain de compilação
  (`python3`, `make`, `g++`) — `better-sqlite3` compila binário nativo.

## Instalação

```bash
git clone https://github.com/fbfert/assistente_pessoal.git
cd assistente_pessoal

cp .env.example .env
$EDITOR .env            # preencha as chaves; veja os comentários do arquivo
```

O `.env.example` documenta **todas** as variáveis. As duas que você provavelmente
vai querer mexer depois de rodar um tempo são `RESPOSTA_GATILHO_JANELA_MIN` e
`SILENCIOS_ATE_REDUZIR_TOM` — os dois números "no chute" do piloto.

```bash
docker compose up -d --build
```

## Primeiro pareamento (QR)

Na primeira execução o bot precisa parear com o WhatsApp:

```bash
docker compose logs -f tars
```

O QR aparece no log. Escaneie com o WhatsApp do **chip dedicado** (WhatsApp →
Dispositivos conectados → Conectar um dispositivo).

A sessão fica em `/data/auth`, dentro do volume `tars_data`. Ela sobrevive a
`docker compose restart` e a `up --build`. **Se você apagar o volume, precisa
parear de novo** — presencialmente, com o chip na mão.

Se o WhatsApp derrubar a sessão (logout), o bot para de tentar reconectar e diz
isso no log. Apague `/data/auth` e reinicie para gerar um QR novo.

## Convidar os 5 pilotos

O onboarding é **proativo**: quem manda a primeira mensagem é o bot.

```bash
docker compose exec tars node scripts/convidar-piloto.js +5511999999999
```

Isso cria o usuário, coloca a anamnese no estado 0 e envia o texto de
consentimento. A **próxima mensagem que a pessoa mandar já é a resposta ao
consentimento** — a conversa segue sozinha a partir daí, uma pergunta por vez,
até a anamnese concluir e os gatilhos ligarem.

Repita para cada um dos 5. Convidar o mesmo número duas vezes é seguro: reaproveita
o usuário em vez de duplicar.

## Dashboard

O dashboard é alcançável **somente pelo loopback do host**. Ele mostra dado de saúde de
pessoas identificadas — por isso nunca é exposto na porta pública, mesmo tendo senha
(ver [Backend administrativo](#backend-administrativo)).

No Compose, o processo escuta em `0.0.0.0` *dentro do container* (lá o `127.0.0.1` seria o
loopback do próprio container, que o mapeamento de porta não alcança) e quem restringe é o
bind `127.0.0.1:3300:3300`. Rodando direto no host, ele escuta em `127.0.0.1` — controlado por
`DASHBOARD_HOST`. Para conferir que está certo, olhe a porta no host, não a do processo:

```bash
ss -ltn | grep 3300      # precisa aparecer 127.0.0.1:3300, nunca 0.0.0.0:3300
```

O acesso é por túnel SSH:

```bash
ssh -L 3300:localhost:3300 usuario@<meu-ip>
```

Depois abra <http://localhost:3300> no seu navegador.

Ele mostra, por pessoa: onde parou na anamnese, taxa de resposta do check-in,
despejos espontâneos da semana, silêncios consecutivos por tipo de gatilho e
correções reportadas. Quem cruzou o limiar de silêncio aparece destacado em
vermelho — é o sinal de que alguém está sumindo.


## Backend administrativo

O dashboard não é só leitura: é a superfície de operação do piloto. Ele existe
para tirar a operação do `docker compose exec` + SQL manual.

### Como entrar

Login por **e-mail e senha**, com contas em `admin_usuarios`. Se você abre pelo
domínio, o navegador pede credencial **duas vezes** — são camadas diferentes, e
podem ter senhas diferentes:

| Quem pergunta | O que é | Onde se troca |
|---|---|---|
| Caixa do navegador, antes da página | Basic Auth do Apache (`.htaccess`) | `htpasswd -b /home/tdah/.htpasswd <email>` no servidor |
| Formulário dentro da página | Conta do admin | `/conta`, dentro do próprio admin |

Por túnel SSH só a segunda existe — o Apache não está no caminho.

**Trocar a senha do admin:** entre e vá em *Minha conta*. Pede a senha atual, e a
troca encerra as demais sessões daquela conta.

### Bootstrap: ninguém fica trancado para fora

Na primeira subida, se não houver nenhuma conta, uma é criada a partir de
`ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_PASSWORD`. **Depois disso `ADMIN_PASSWORD` não é
mais aceita no login** — entrar passa a ser pela senha da conta.

Se o banco for recriado, o bootstrap roda de novo e a conta volta com a senha do
`.env`. Se você já tinha trocado a senha em `/conta`, ela se perde nesse caso.

### Duas camadas de proteção

1. **Bind em loopback** — o processo nunca é alcançável da rede pública.
2. **Conta de administrador** — e-mail e senha, com hash `scrypt` e sal por conta.

A conta existe porque o admin exibe o histórico completo das conversas e permite
**escrita** sobre dado de saúde. O bind protege contra a rede; a conta protege
contra quem já está do lado de dentro do túnel — e diz **quem** fez cada
alteração, o que uma senha compartilhada não faz.

### O que dá para fazer

| | |
|---|---|
| **Esteira** | Lista nominal de quem está pendente de consentimento, quem consentiu sem concluir, e quem concluiu — não só a contagem |
| **Detalhe** | Todos os campos da anamnese, personalidade, consentimento com data e versão, remédios, gatilhos e o histórico completo de conversas |
| **Convidar** | Formulário de número novo, sem abrir SSH |
| **Editar anamnese** | Qualquer campo da whitelist, direto na tela |
| **Remédios** | Editar nome/horário e remover. Campo vazio grava `sem informação` (Regra 1b) — e remédio nesse estado não vira gatilho |
| **Gatilhos** | Ativar, desativar e mudar horário. É assim que se liga o `checklist_fim_dia`, que nasce desligado |
| **Silêncio** | Zerar contador, dando segunda chance sem esperar a pessoa responder |
| **Pausar** | Suspende todos os disparos sem apagar nem desativar nada. Despausar restaura o estado exato |
| **Reiniciar anamnese** | Ação destrutiva, com confirmação: limpa campos, remédios e gatilhos |
| **Anonimizar** | Saída do piloto. Ver abaixo |
| **Conexão** | Status do WhatsApp e QR de pareamento como imagem, sem `docker compose logs` |

Toda ação de escrita grava uma linha `acao_admin` em `historico_interacoes` —
mesmo log append-only de qualquer outra interação, sem tabela paralela.

### Saída do piloto: anonimizar, não excluir

`historico_interacoes` tem `ON DELETE CASCADE` a partir de `usuarios`. Apagar o
participante levaria junto o registro de que ele **consentiu** — com data e
versão — e o rastro de tudo que foi feito com o dado dele. É exatamente a prova
que uma fiscalização pede.

A anonimização redige número, campos da anamnese, remédios **e o texto de todas
as interações** (é lá que estão as conversas, com nome e detalhes de saúde
escritos pela própria pessoa). Preserva tipo, data e o registro do consentimento.

É irreversível e não tem desfazer.

### Confirmação em duas etapas

O projeto não usa JavaScript de cliente, então não há `confirm()` do navegador.
Ação destrutiva passa por uma página intermediária que descreve o efeito antes
do POST. Abrir essa página não altera nada.

## Recriar o banco (só com o banco vazio)

As mudanças de schema do backend admin — coluna `pausado`, tipo `acao_admin` e a
tabela `estado_conexao` — foram aplicadas direto no `schema.sql`, porque o banco
do piloto estava **vazio** quando isso foi feito. Como o schema usa
`CREATE TABLE IF NOT EXISTS`, um banco já existente **não** ganha as mudanças
sozinho: precisa ser recriado.

```bash
# CONFIRA ANTES. Se retornar qualquer numero diferente de 0, PARE.
docker compose exec dashboard node -e "
  import('./src/db/db.js').then(({getDb}) => {
    const db = getDb(); let t = 0;
    for (const x of ['usuarios','remedios','gatilhos_configurados','contadores','despejos_semana','historico_interacoes'])
      t += db.prepare('SELECT COUNT(*) n FROM '+x).get().n;
    console.log('linhas:', t);
  });"

# So se o total for 0:
docker compose down
docker volume ls | grep tars_data     # confirme o nome exato
docker volume rm <nome_do_volume>
docker compose up -d --build
```

> **Isso apaga o pareamento do WhatsApp junto** (`/data/auth` vive no mesmo
> volume). Você vai precisar escanear o QR de novo, presencialmente com o chip.

Se já houver dado real, o caminho é outro: SQLite não altera CHECK constraint com
`ALTER TABLE`. A migração segura é, dentro de uma transação e com
`PRAGMA foreign_keys=OFF`, criar a tabela nova com a constraint atualizada,
copiar os dados, dropar a antiga e renomear. Escreva isso como script de
migração — não recrie o banco.

## Rodar os testes localmente

```bash
npm install
npm test
```

Os testes usam SQLite temporário real (não mock) e exercitam o handler e a
máquina de estados de verdade. Nenhum teste chama LLM nem WhatsApp: rodam sem
chave de API e sem número.

## Como funciona

**Anamnese** (13 estados, 0 a 12): consentimento → nome → o que trava → rotina →
gatilhos de sobrecarga → sinal de alerta → remédio → pessoas-chave → vocabulário
próprio → nunca fazer → personalidade → resumo → concluído.

**Personalidades** (3, fixas no MVP): `direto`, `caloroso`, `neutro`. Todas
compartilham um núcleo fixo de 8 regras de sistema que nenhuma variante pode
relaxar.

**Gatilhos** (3, fixos no MVP):

| Gatilho | Horário padrão | Estado |
|---|---|---|
| `checkin_manha` | 08:00 | ativo |
| `remedio` | o que a pessoa informou | um por remédio com nome **e** horário |
| `checklist_fim_dia` | 20:00 | **inativo** (`ativo=0`) — ligar é decisão manual |

**Regra de silêncio:** o mesmo gatilho nunca é reenviado duas vezes no mesmo dia.
Depois de 3 silêncios consecutivos do mesmo tipo, a mensagem seguinte fica **mais
curta e menos exigente** — nunca mais insistente. Quem já está sumindo não precisa
de mais pressão.

**Regra 1b:** o sistema nunca inventa nem estima dado de saúde. Campo sem
informação é a string literal `sem informação`, nunca um chute. Remédio sem nome
ou sem horário não vira gatilho — não há o que lembrar.

---

## O que ficou simplificado de propósito

O piloto é para 5 pessoas. Várias decisões aqui seriam erradas em produção e são
corretas nessa escala. Elas estão listadas para que ninguém as "conserte" por
engano:

- **Correção de anamnese é manual no banco.** Quando a pessoa aponta erro no
  resumo, o sistema apenas **registra** o pedido no histórico e segue. Não tenta
  parsear qual campo mudar — parse automático de "na verdade meu remédio é às 9,
  não às 8" é uma superfície de erro grande para 5 pessoas.
- **A rotina não é separada em dois campos.** O estado 3 pede horário bom e ruim
  numa mensagem só e grava tudo em `rotina_boa`. A coluna `rotina_ruim` já existe
  no schema para que separar depois não exija migração.
- **A heurística não distingue a 1ª da 2ª mensagem na janela.** Se a pessoa manda
  duas mensagens dentro dos 120 minutos após um gatilho, as duas contam como
  resposta ao mesmo gatilho. O limite é inclusivo: exatamente 120 min ainda conta.
- **Os dois números são chute, e por isso são variáveis de ambiente.** Não há base
  empírica para `RESPOSTA_GATILHO_JANELA_MIN=120` nem para
  `SILENCIOS_ATE_REDUZIR_TOM=3`. O piloto é que vai calibrá-los.
- **SQLite estruturado, não banco vetorial.** Nessa escala o vetorial não melhora
  segurança nem qualidade de resposta, e adiciona um serviço para operar.
- **Dashboard sem biblioteca de gráfico.** É uma tabela HTML. São 5 pessoas.
- **Biblioteca não-oficial do WhatsApp** (`@whiskeysockets/baileys`). Pode quebrar
  a qualquer atualização e o número pode ser banido. Por isso o chip é dedicado e
  separado do de produção. A migração para a API oficial vem depois da validação.
- **Dado de saúde sem criptografia em repouso.** O SQLite fica em claro no volume.
  Para 5 pessoas em servidor próprio, o controle é o acesso ao servidor. Se isso
  virar produto, muda.
- **`checklist_fim_dia` existe mas nasce desligado.** É o terceiro gatilho da
  esteira, e não é usado no piloto.

## Specs

Este projeto é spec-driven, com [OpenSpec](https://github.com/Fission-AI/OpenSpec).
As specs são a fonte de verdade e ficam em `openspec/`:

```bash
openspec list                              # mudanças ativas
openspec validate --all --no-interactive   # valida specs e mudanças
```

As regras que todo agente de IA deve seguir neste repositório estão em
[`AGENTS.md`](AGENTS.md) — leia antes de mudar código.

> **Nota sobre a raiz do repositório:** por decisão do dono do projeto, a raiz é
> `/home/tdah`, que também é o home de uma conta de hospedagem (Virtualmin). O
> `.gitignore` e o `.dockerignore` excluem `Maildir/`, `public_html/`, `logs/`,
> `etc/`, `cgi-bin/` e `virtualmin-backup/`. **Confira `git status` antes de
> qualquer `git add`** e nunca use `git add -A` às cegas.
