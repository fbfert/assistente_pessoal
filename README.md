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

### Configuração viva: mudar sem deploy

Os números e textos que o piloto existe para calibrar saem do código e viram
editáveis pela interface, com histórico de autor e caminho de volta.

**Onde fica cada coisa:**

| O quê | Onde se edita |
|---|---|
| Horário padrão dos gatilhos, mensagens de cada tipo | `/gatilhos` |
| Núcleo fixo, variantes de tom, texto de consentimento | `/ia` |
| Chave de API e provedor ativo | `/credenciais` — **nunca** nas outras duas |

**Ordem de leitura, três degraus:** o valor no banco; a variável de ambiente, para
as chaves que têm uma; a constante do código. O terceiro existe porque parte das
chaves nunca teve variável — os horários padrão sempre foram constantes.

**Reverter é escrever de novo.** A linha antiga do histórico fica onde está e a
reversão acrescenta a sua. Um "desfazer" que apagasse o rastro tiraria do piloto a
única resposta para *"o comportamento mudou; foi o produto ou fui eu mexendo?"*.
"Restaurar padrão" volta à constante do código, não à linha mais antiga — que já
pode ser uma edição.

**Toda mudança é auditada** em `auditoria_admin`, com autor, chave e os dois
valores. Configuração global não tem participante associado; por isso não vai para
o histórico de ninguém.

### A tela de Gatilhos

Reúne o que estava em cinco lugares: por tipo, o horário padrão, as mensagens
(normal e a de tom reduzido, que é a regra de silêncio em ação) e quantos
participantes têm aquele tipo ativo. Embaixo, uma linha por participante, só
leitura, com link para a página dele — mudar o gatilho de UMA pessoa continua
sendo lá.

Mensagem passa por confirmação em duas etapas, com o antes e o depois lado a lado;
horário salva direto. A mensagem é o que todo mundo vai ler; o horário padrão só
alcança quem for convidado daqui para frente — e a tela diz isso.

A mensagem de remédio usa o marcador `{remedio}`, e o sistema **recusa** salvá-la
sem ele: sem o marcador, o lembrete deixaria de dizer qual remédio é.

### A tela de IA e persona

Núcleo fixo, as três variantes de tom e o texto de consentimento num lugar só. O
provedor ativo aparece em leitura, com link para `/credenciais` — aqui não há
campo de chave de API, de propósito.

**Testar antes de publicar.** Você escreve uma mensagem de exemplo, escolhe a
variante e o sistema chama o LLM de verdade contra um contexto de anamnese
**fictício** — nunca o de um participante real, que transformaria o teste numa
forma de ler dado de saúde sem abrir a página da pessoa. Usa o texto que está nos
campos, **inclusive o que você ainda não salvou**: é o que permite calibrar antes
de publicar para todos.

A chamada não grava nada: nenhum participante, nenhum histórico, nenhum contador.

> **Cada teste é uma chamada paga.** O teto é de 20 por administrador e por hora,
> configurável em `TESTE_IA_LIMITE_HORA`; zero desliga o limite. Ele existe para o
> caso acidental — formulário reenviado em laço, aba esquecida recarregando.

Depois de responder, a tela avisa se aquela resposta **seria bloqueada** pela
verificação de medicação antes de chegar em alguém. Se você está editando o núcleo
e isso aparece, é sinal de que a Regra 1c ficou fraca.

**O núcleo fixo pede confirmação reforçada:** digitar uma palavra numa segunda
etapa, não um clique. Ele carrega as regras de segurança do produto, e um erro ali
muda o comportamento com todos ao mesmo tempo, em silêncio. A exigência vive no
repositório, não na tela — nenhum caminho novo consegue contorná-la.

> A verificação determinística que bloqueia instrução de medicação **não** é
> editável pela interface, de propósito. Se fosse, uma única edição descuidada
> removeria as duas camadas de uma vez.

### Consentimento: editar sempre troca a versão

O texto de consentimento se edita em `/ia`. **Toda gravação incrementa a versão** —
não existe caminho de salvar mantendo a versão, porque a versão é derivada da
contagem de edições. `usuarios.consentimento_versao` só significa alguma coisa se
identificar qual texto a pessoa leu.

**Quem já aceitou continua consentido**, com a versão que aceitou registrada. Não
há fluxo de reconsentimento — decisão registrada do dono do produto. A página do
participante marca quem está numa versão anterior, para a decisão ser auditável.

> Se uma edição futura mudar **o que é feito com o dado**, e não apenas a redação,
> essa decisão precisa ser revista: o consentimento registrado deixaria de cobrir o
> tratamento real.

### Agrupar mensagens em rajada (debounce)

Quem está em sobrecarga escreve em pedaços. Com `DEBOUNCE_SEGUNDOS` acima de zero,
o bot espera esse tanto de silêncio depois da última mensagem e responde as três de
uma vez, em lugar de três respostas.

**Nasce desligado** (`0` = comportamento de sempre) e é editável na configuração
viva. Vale **só no WhatsApp** e **só no chat livre**:

- durante a anamnese nunca agrupa — ela é pergunta-resposta de um passo por vez, e
  juntar duas mensagens faria a máquina de estados pular um estado;
- no canal web não faz sentido: a rota é requisição-resposta, e o cliente já
  impede a rajada desabilitando o envio enquanto espera.

Áudio entra no grupo **transcrito e na ordem em que chegou**.

> O buffer vive na memória do processo. Se o container reiniciar dentro da janela
> de poucos segundos, as mensagens acumuladas se perdem. É limitação aceita por
> decisão registrada: persistir custaria uma escrita no caminho quente de toda
> mensagem para cobrir um evento raro.

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

**Remédio dito na conversa depois da anamnese é gravado** — mas só com horário.
Quem escreve "considere 23 horas pro bup" tem o horário salvo, o lembrete criado, e
recebe de volta exatamente o que foi gravado. Menção sem horário não grava nada: sem
horário não existe lembrete, e cadastrar a partir de uma menção de passagem criaria
remédio que ninguém pediu. Nome que já existe é atualizado, nunca duplicado.

Isso existe porque na primeira sessão real do piloto a pessoa pediu isso três vezes e
o sistema não gravou nada — a extração só rodava dentro da anamnese.

**O histórico guarda os dois lados.** Toda mensagem que o sistema envia — pergunta de
anamnese e resposta de chat livre — é registrada junto com o que a pessoa escreveu.
Antes, só a mensagem recebida era gravada, e não havia como auditar o que o assistente
tinha respondido.

**Aprendizado contínuo: o perfil acumula depois do dia 1.** A anamnese captura o
perfil uma vez; a partir dela, cada mensagem de chat livre passa por um extrator que
pergunta ao modelo se a pessoa revelou algo novo e **permanente** sobre si.

*Elegível:* o que trava, rotina, gatilhos de sobrecarga, sinal de alerta, pessoas-chave,
vocabulário próprio, nunca fazer. A lista é derivada dos campos da anamnese, não
redigitada.

*Nunca tocado:* **remédio** e **nome**. Remédio tem extração própria, com tratamento de
Regra 1b específico para dado de saúde regulado — misturar faria uma regra estrita e
auditável passar a valer para um extrator mais solto. Nome é identidade, não traço: o
bot "aprender" um nome diferente do que a pessoa pediu seria regressão.

*Conservador de propósito:* só captura o que a pessoa disse **de si mesma** e descreveu
como **geral ou recorrente**, e que seja **novo** frente ao que já se sabe. As três
condições valem juntas. "Hoje o trânsito me deixou louco" não vira nota; "barulho de
obra sempre me derruba a semana" vira. Na dúvida, não captura — perder uma nota é
recuperável, um traço falso no perfil se propaga em silêncio para toda mensagem
seguinte.

*A nota empilha, nunca substitui.* O que a pessoa respondeu no dia 1, sob consentimento
formal, continua intacto. No contexto do assistente as duas coisas aparecem com rótulos
diferentes: `O que trava: começar as coisas | Notas aprendidas depois: reunião longa
(12/09)`.

*Nada é enviado por causa disso.* A extração roda **em paralelo** com a resposta, que
não espera por ela. O reconhecimento aparece a partir da mensagem seguinte, pelo
contexto enriquecido — atrasar toda resposta para reconhecer no mesmo turno é
exatamente o atrito que a regra de ouro do input mínimo existe para evitar.

**Ver a conversa anterior.** Quem fecha e reabre a aba encontra a tela limpa e um botão
*"ver conversa anterior"*. Clicando, a página traz as **últimas 50 mensagens** — as dela
e as do assistente, incluindo os check-ins que saíram pelo WhatsApp: é a mesma conversa,
dois transportes.

Não carrega sozinha de propósito: a sessão dura seis horas e o token fica no navegador,
então quem reabre a aba pode não ser quem conversou. E nada é guardado no navegador além
do token — o servidor é a fonte.

O que **nunca** volta por esse caminho: registro interno (entrada no canal, ação do
operador), nota de aprendizado — que é inferência sobre a pessoa, não o que ela disse —
e, sobretudo, **resposta bloqueada por segurança**, que é justamente o texto que o
sistema recusou entregar.

Uma limitação sem conserto: conversa anterior a agosto/2026 só tem o lado da pessoa. As
respostas do assistente daquela época não eram gravadas.

*Como remover uma nota errada:* na página do participante, seção **Aprendizado
contínuo**, link `remover` ao lado da nota. Passa pela confirmação de duas etapas e é
**soft delete**: a nota some do contexto do assistente na mensagem seguinte e continua
no banco, riscada na tela, com quem removeu e quando. A remoção é auditada com o campo
e o texto da nota.

*O custo, sem rodeio:* é **mais uma chamada de LLM por mensagem de chat livre**, sempre
— aprendendo algo ou não. Somada à chamada de resposta (e à de remédio, quando o texto
menciona medicação), uma mensagem pode custar até três chamadas.

Dimensionando para o piloto — 5 pessoas, 2 a 3 semanas, na casa de 10 mensagens de chat
livre por pessoa por dia: cerca de **mil chamadas extras no período inteiro**. Cada uma
é curta: o prompt de extração mais o perfil conhecido dão algumas centenas de tokens de
entrada, e a resposta é uma linha de JSON. Ordem de grandeza de poucos dólares no
piloto inteiro — o valor exato depende do provedor e do modelo ativos em
`/credenciais`. Num volume de produto, é o primeiro lugar a revisar: dá para filtrar por
indício antes de chamar, como a extração de remédio já faz.

**Pergunta de volta não vira perfil.** Se a pessoa responde "como assim?", o sistema
explica a pergunta de outro jeito em vez de gravar a dúvida como resposta — uma vez
por pergunta; a segunda dúvida seguida é aceita como está, para não travar ninguém.

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
