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
pessoas identificadas e não tem autenticação — por isso nunca é exposto na porta pública.

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
