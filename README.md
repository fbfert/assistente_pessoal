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

> **O formulário de convite do admin não substitui este comando ainda.** Ele cria
> o participante e registra a intenção, mas quem tem a sessão do WhatsApp é o
> processo do bot, noutro container — a entrega da mensagem continua saindo por
> aqui. Fechar isso usaria o mesmo mecanismo de tabela compartilhada que já
> resolve o QR, e é escopo ainda não construído.

## Como acessar o admin

Dois caminhos. Nos dois, quem autentica é a **aplicação** — e-mail e senha no
formulário da página.

**Pelo domínio** (é como se usa no dia a dia):

<https://tdah.xiax.com.br>

Um proxy reverso do Apache atende o domínio e repassa para o processo. Ele **não**
autentica: `public_html/.htaccess` só faz o proxy, força HTTPS e mantém a página
fora de buscadores. Esse arquivo vive fora do Git — é configuração deste servidor,
não se replica num clone.

**Por túnel SSH** (não depende do Apache):

```bash
ssh -L 3300:localhost:3300 usuario@<meu-ip>
```

E abra <http://localhost:3300>.

### O processo nunca fica exposto direto

No Compose ele escuta `0.0.0.0` *dentro do container* — lá o `127.0.0.1` seria o
loopback do próprio container, que o mapeamento de porta não alcança — e quem
restringe é o bind `127.0.0.1:3300:3300`. Rodando direto no host, escuta
`127.0.0.1`, controlado por `DASHBOARD_HOST`.

Confira pela porta observada no host, **nunca** pelo que o processo loga:

```bash
ss -ltn | grep 3300      # precisa aparecer 127.0.0.1:3300, nunca 0.0.0.0:3300
```

### O painel

Mostra, por pessoa: onde parou na anamnese, taxa de resposta do check-in, despejos
espontâneos da semana, silêncios consecutivos por tipo de gatilho e correções
reportadas. Quem cruzou o limiar de silêncio aparece destacado em vermelho — é o
sinal de que alguém está sumindo.

Abaixo, a **esteira**: a lista nominal de quem está pendente de consentimento, de
quem consentiu sem concluir e de quem concluiu. A contagem diz que existe um
problema; a lista diz em quem cutucar.


## Backend administrativo

O dashboard não é só leitura: é a superfície de operação do piloto. Ele existe
para tirar a operação do `docker compose exec` + SQL manual.

### Como entrar

Login por **e-mail e senha**, no formulário da própria página. Uma credencial só.

Houve, por um tempo, um Basic Auth do Apache pedindo credencial num popup antes
da página. Ele existiu enquanto a aplicação **não tinha login nenhum**; depois que
as contas passaram a existir, ele só somava um segundo popup pedindo a mesma
coisa, e foi removido.

**Consequência que fica registrada:** o formulário de login é agora publicamente
alcançável em `https://tdah.xiax.com.br/login`. A proteção contra força bruta
passou a ser da aplicação:

- cada falha responde com **atraso fixo** — não contornável, derruba a taxa de
  tentativa em ordens de grandeza;
- **5 falhas da mesma origem bloqueiam por 15 minutos**, inclusive para quem
  acertar a senha depois.

O bloqueio vive na memória do processo: reiniciar o container o limpa. Isso é
aceitável para o caso acidental, e não é uma defesa contra ataque persistente —
o que protege de verdade é a senha ser forte.

**Trocar a senha do admin:** entre e vá em *Minha conta*. Pede a senha atual, e a
troca encerra as demais sessões daquela conta.

### Contas da equipe

Em *Administradores* dá para criar, desativar, reativar e resetar senha.

- **Criar** não pede senha: o sistema gera uma temporária e a mostra **uma única
  vez**. Anote e entregue à pessoa — ela não é recuperável depois, nem no log.
  Quem entrar com ela só alcança a tela de troca até trocá-la.
- **Resetar** é o caminho de recuperação de acesso. Não há servidor de e-mail, então
  quem perdeu a senha depende de outro administrador ativo gerar uma nova.
- **Desativar** nunca apaga a conta — a auditoria precisa continuar podendo nomear
  quem fez o quê. Duas guardas de servidor: ninguém desativa a própria conta, e a
  última conta ativa é protegida.

Não há hierarquia de permissão: toda conta vê e edita tudo, por decisão registrada.

**Onde fica a auditoria.** Ação sobre participante fica na página dele; ação sobre
contas da equipe fica em *Administradores*. São linhas do tempo diferentes de
propósito — quem abre a página de um participante quer o que aconteceu com ele.

### Bootstrap: ninguém fica trancado para fora

Na primeira subida, se não houver nenhuma conta, uma é criada a partir de
`ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_PASSWORD`. **Depois disso `ADMIN_PASSWORD` não é
mais aceita no login** — entrar passa a ser pela senha da conta.

Se o banco for recriado, o bootstrap roda de novo e a conta volta com a senha do
`.env`. Se você já tinha trocado a senha em `/conta`, ela se perde nesse caso.

### O que protege o admin

O admin exibe o histórico completo das conversas e permite **escrita** sobre dado
de saúde de pessoas identificadas. O que fica entre isso e a internet:

| Camada | O que faz | Limite |
|---|---|---|
| Bind em loopback | O processo nunca é alcançável direto da rede | O Apache alcança, e é ele que atende o domínio |
| Conta de administrador | E-mail e senha, hash `scrypt` com sal por conta | Só é tão forte quanto a senha escolhida |
| Atraso a cada falha de login | Derruba a taxa de tentativa em ordens de grandeza | Não bloqueia, só freia |
| Bloqueio por origem | 5 falhas em 15 minutos travam aquela origem | Depende do IP do cabeçalho de proxy, que é forjável |
| HTTPS obrigatório | A senha nunca trafega em claro | — |

A conta também responde **quem** fez cada alteração — o que uma senha
compartilhada não faz, e é metade do valor da auditoria.

**Sendo direto sobre o limite:** as duas últimas linhas são defesa em
profundidade, não garantia. O que protege de verdade é a senha ser forte.

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
| **Personalidade** | Trocar entre `direto`, `caloroso` e `neutro`. Importa porque o estado 10 da anamnese assume `neutro` quando a resposta não é reconhecida — há um caminho em que a pessoa ficou com um tom que não escolheu |
| **Conexão** | Status do WhatsApp e QR de pareamento como imagem, sem `docker compose logs` |

Toda ação de escrita sobre um participante grava uma linha `acao_admin` em
`historico_interacoes`, com o autor identificado — mesmo log append-only de
qualquer outra interação daquela pessoa.

Ações sobre **contas da equipe** vão para `auditoria_admin`, um log separado. A
divisão é semântica: quem abre a página de um participante quer o que aconteceu
com **ele**, não que alguém trocou de senha. Tecnicamente também não caberia —
`historico_interacoes.usuario_id` é obrigatório e referencia um participante.

### Mapa das telas

| Rota | O que é |
|---|---|
| `/` | Painel: totais, tabela de participantes, esteira, convite |
| `/usuarios/:id` | Detalhe: anamnese, personalidade, remédios, gatilhos, silêncios, histórico completo |
| `/admins` | Contas da equipe e auditoria da equipe |
| `/conta` | Trocar a própria senha |
| `/conexao` | Estado do WhatsApp e QR |
| `/credenciais` | Chave, modelo e provedor ativo de cada LLM, mais o modelo de transcrição |
| `/login` | Entrada |

### Credenciais de LLM: chave, modelo e provedor ativo

Trocar a chave de um provedor **não exige mais SSH nem reinício**. Em
`/credenciais` há uma seção por provedor (Claude, OpenAI, DeepSeek), e cada uma
tem:

- **Chave de API nova** — campo write-only. Ele abre **vazio** mesmo quando já
  existe uma chave configurada; a tela mostra só os últimos quatro caracteres,
  para você identificar qual está lá. Deixar vazio preserva a atual, o que
  permite editar só o modelo sem redigitar a credencial.
- **Modelo** — uma lista curta com o padrão do projeto e o que estiver gravado,
  mais um campo de texto livre ao lado. **O campo livre vence a lista quando
  preenchido.** A lista é atalho para o caso comum, nunca restrição: modelo novo
  se digita no campo.
- **Salvar** e **Testar**, lado a lado. Testar faz uma chamada real, mínima
  ("responda apenas 'ok'"), e **não grava nada** — usa a chave digitada no
  formulário se houver uma, ou a já salva se o campo estiver vazio. Use antes de
  substituir uma chave que funciona: sobrescrever é irreversível.

Acima das seções, um **seletor único de provedor ativo** na conversa. A troca
vale na mensagem seguinte, sem reiniciar container nenhum.

Na seção da OpenAI existe um segundo campo, **modelo de transcrição de áudio**.
Ele usa a **mesma chave** da OpenAI logo acima — é a mesma conta desde o começo
do projeto. A transcrição é **sempre OpenAI**, independentemente do provedor
ativo escolhido para a conversa; o que a tela configura é só o modelo.

**O `.env` continua funcionando exatamente como antes.** Ninguém é obrigado a
migrar. A ordem é de dois degraus: vale o que estiver configurado na tela e, na
falta, a variável de ambiente (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`DEEPSEEK_API_KEY`, `LLM_PROVIDER`, `TRANSCRIPTION_MODEL`). Faltando os dois, a
chamada falha dizendo qual provedor e onde configurar — nunca em silêncio e
nunca caindo em outro provedor por conta própria.

**Onde isso fica gravado:** num arquivo dentro do volume `tars_data`
(`/data/llm-chaves.json`, permissão `0600`), ao lado do banco e do pareamento do
WhatsApp. Não no banco, de propósito — o banco é o que se copia em backup, o que
se inspeciona quando algo dá errado, e o que tem "ver histórico" como
funcionalidade. Credencial não pertence a esse ciclo.

> **Recriar o volume apaga estas credenciais junto** com o banco e o pareamento
> (ver *Recriar o banco*, abaixo). Não há backup delas em lugar nenhum, e a única
> forma de recuperá-las é reconfigurar pela tela.

**A chave nunca é devolvida.** Não existe caminho de leitura da credencial para
a interface, e não existe "ver histórico" de credencial — guardar a anterior
significaria manter, num lugar consultável, uma chave provavelmente revogada.
Toda gravação é auditada em `auditoria_admin`, registrando **qual provedor mudou
e quem mudou** — nunca o valor, nem antigo nem novo, nem mascarado.

**Quem copiar o volume passa a copiar credenciais de terceiros junto.** Isso não
era verdade antes desta funcionalidade e vale para snapshot de disco também.

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

## O canal web (segundo canal, reativo)

Além do WhatsApp, existe uma página de conversa em navegador. Ela roda **no mesmo
processo do bot** (`tars`), não no dashboard: acesso direto ao banco e ao mesmo
núcleo de conversa, sem API entre containers.

### Para quem é

- Quem trabalha em máquina onde o WhatsApp Web é bloqueado.
- Quem separa a vida pessoal do aparelho de trabalho, ou não quer um assistente de
  saúde no mesmo lugar em que a família manda mensagem.
- E o motivo que vale para todo mundo: `@whiskeysockets/baileys` é biblioteca
  **não-oficial**. Se a sessão cair ou o número for bloqueado, o piloto não para.

Não substitui o WhatsApp. É o mesmo participante, a mesma anamnese, o mesmo
histórico — outro transporte.

### O que este canal NÃO faz

**Ele nunca escreve primeiro.** Sem check-in da manhã, sem lembrete de remédio, sem
checklist de fim de dia, sem cobrança de silêncio. Só responde quando a pessoa
escreve.

Isso é decisão de produto, não pendência: o mecanismo central do TARS é **chegar
antes**, e nenhuma entrega por navegador tem a garantia que um lembrete de remédio
precisa ter — depende de permissão que este público costuma negar, falha em silêncio
com a aba fechada e se comporta diferente em cada navegador.

A divisão, em uma frase: **a web é onde a pessoa procura o TARS; o WhatsApp é onde o
TARS procura a pessoa.** Todo gatilho continua saindo pelo WhatsApp, inclusive para
quem só conversa pela web.

### Como pré-cadastrar alguém

O convite é o **ponto único de cadastro**, para os dois canais. No painel, o
formulário *Convidar piloto novo* pede duas coisas:

| Campo | Para quê |
|---|---|
| Número de WhatsApp | Identifica a pessoa e recebe o texto de consentimento |
| Data de nascimento | Segundo fator da entrada pelo canal web |

Pela linha de comando é o mesmo cadastro:

```bash
docker compose exec tars node scripts/convidar-piloto.js +5511999999999 1990-04-23
```

**Quem foi convidado antes desta funcionalidade não tem data cadastrada** e, por isso,
não entra pela web. A página do participante avisa e deixa corrigir — nenhum valor é
inventado por padrão.

### O link que a pessoa usa

**https://tdah.xiax.com.br/chat/**

O servidor escuta na porta do canal web (`WEB_PORT`, padrão `3400`), publicada apenas
no loopback do host — como o admin. Quem expõe é o proxy reverso do Apache, em
`public_html/.htaccess`, que **vive fora do Git**. Por isso a regra fica registrada
aqui: se o arquivo se perder, é isto que precisa voltar, **antes** da regra que manda
tudo para o admin na 3300.

```apache
RewriteRule ^chat$ /chat/ [R=301,L]
RewriteRule ^chat/(.*)$ http://127.0.0.1:3400/$1 [P,L]
```

O prefixo `/chat` é **retirado** antes de repassar: o container serve a página na raiz
dele e não sabe onde está montado. É por isso que a página usa caminhos relativos — e
é por isso que a **barra final importa**. Sem ela, `app.js` resolveria para a raiz do
domínio e cairia no admin; o redirecionamento 301 da primeira linha existe para isso.

O canal web **não herda o login do admin**: são portas e processos diferentes, e a raiz
do domínio continua indo para a 3300, atrás de sessão.

Para conferir sem passar pelo proxy, com túnel SSH:

```bash
ssh -L 3400:localhost:3400 usuario@<ip-do-servidor>
# depois, no navegador: http://localhost:3400
```

A pessoa entra com **telefone + data de nascimento** — os mesmos dados do
pré-cadastro. Não há senha, não há cadastro pela página, e a rota **nunca cria
participante**: quem não foi convidado não entra.

### Como isso é protegido

- **Resposta de erro sempre igual**, exista o telefone ou não. Distinguir
  transformaria a rota num verificador de quem está no piloto — que é, por si só,
  informação de saúde.
- **5 tentativas em 15 minutos**, contadas por origem **e** por telefone, mais um
  segundo de atraso a cada falha. A contagem por telefone é a que segura ataque
  distribuído: o endereço chega por proxy e é forjável, o telefone não.
- **Sessão de 6 horas de inatividade**, renovada a cada mensagem. O banco guarda só o
  hash do token.
- **Expirar a sessão não apaga nada.** A pessoa entra de novo com os mesmos dados e a
  conversa continua de onde parou.
- **A página não carrega nada de fora** — sem framework, sem CDN, sem build. Uma CSP
  restrita ao próprio domínio faz o navegador recusar qualquer exceção.
- **Cada visitante tem o próprio limite.** O Express confia no cabeçalho do proxy, então
  o endereço que conta é o de quem acessa, não o `127.0.0.1` do Apache — sem isso,
  cinco erros de um desconhecido trancariam todo mundo.

> **O par telefone + data de nascimento é deliberadamente fraco.** Foi escolhido para
> não exigir senha de quem tem TDAH no primeiro contato. Se o piloto crescer, é a
> primeira coisa a trocar.

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
>
> **E apaga as credenciais de LLM** (`/data/llm-chaves.json`): chave, modelo,
> provedor ativo e modelo de transcrição configurados pela tela. Só o que
> estiver no `.env` sobrevive. Reconfigure em `/credenciais` depois de subir.

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

**Dois canais, um caminho.** WhatsApp e web são adaptadores finos sobre o mesmo
núcleo de conversa (`src/conversa/nucleo.js`): mesma anamnese, mesma classificação,
mesma persona, mesmo LLM. O que muda é só o transporte — e quem manda mensagem sem
ser chamado, que continua sendo só o WhatsApp.

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
