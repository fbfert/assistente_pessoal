## Context

### Em cima de que estado esta mudança constrói

Conferido no início desta proposta, e o resultado importa:

| Mudança ativa | Estado | Tocou o código? |
|---|---|---|
| `admin-backend-fase2` | 0/49 tarefas | **Não.** Nenhum arquivo alterado. |
| `aprendizado-continuo` | 0/51 tarefas | **Não.** Nenhum arquivo alterado. |

O último commit a tocar `src/llm/prompts.js` ou `src/whatsapp/handler.js` é o commit
inicial do projeto. Então `canal-web` constrói sobre o **código de hoje**, não sobre
uma versão prometida por outra mudança:

- `montarSystemPrompt(usuario, remedios, notas = [])` — o terceiro parâmetro já foi
  acordado por `aprendizado-continuo` como aditivo. O núcleo repassa o que receber e
  não decide o conteúdo.
- `processarMensagemNormal` e `processarPassoAnamnese` vivem em
  `src/whatsapp/handler.js`, já recebem `enviarMensagem` como parâmetro e já aceitam
  dependências injetadas (`chamar`, `extrair`, `transcrever`, `db`). **É por isso que
  a extração é viável sem reescrever nada**: o handler já é quase canal-agnóstico —
  o que o prende ao WhatsApp é o formato da mensagem de entrada e o `msg.numero`.

**A interface mínima que funciona nos três cenários** (esta mudança primeiro, a Fase 2
primeiro, ou `aprendizado-continuo` primeiro):

```
processarMensagem({ usuario, texto, canal, responder }, deps) → { acao, ... }
```

`usuario` já identificado (o adaptador resolve), `texto` já transcrito (áudio é do
adaptador), `canal` para o registro, `responder(texto)` no lugar de
`enviarMensagem(numero, texto)`. Tudo o mais continua em `deps`. Nenhuma das outras
duas mudanças altera essa assinatura: a Fase 2 mexe na origem do conteúdo dos prompts
e põe debounce **antes** do núcleo; `aprendizado-continuo` acrescenta uma chamada
paralela **dentro** dele.

### Quatro requisitos que duas mudanças ativas modificam ao mesmo tempo

`canal-web` e `aprendizado-continuo` tocam os mesmos quatro requisitos. Nenhum
conflito de conteúdo — as alterações são aditivas e independentes —, mas **quem
sincronizar por último precisa carregar o texto da outra**, senão o `MODIFIED` derruba
o que já estava lá:

| Requisito | `aprendizado-continuo` acrescenta | `canal-web` acrescenta |
|---|---|---|
| `armazenamento` / Histórico append-only | tipo `aprendizado_perfil` | coluna `canal` |
| `armazenamento` / Anonimização de participante | redigir texto das notas | redigir `data_nascimento`, apagar sessões |
| `canal-whatsapp` / Roteamento por estado de anamnese | extração em paralelo | roteamento passa a ser do núcleo |
| `dashboard-piloto` / Página de detalhe do participante | seção de notas aprendidas | data de nascimento e canal por interação |

Registrado aqui para que o segundo `/opsx:sync` seja um merge consciente, e não uma
sobrescrita silenciosa.

### O que já existe e delimita o desenho

- `src/index.js` é o processo do bot: abre o banco, conecta o WhatsApp e inicia o
  scheduler. É onde o servidor web entra.
- `src/dashboard/auth.js` já resolve sessão assinada, cookie e limite de tentativas
  para o admin — com `MAX_FALHAS = 5`, `BLOQUEIO_MS = 15min` e atraso de 1s por falha.
- `src/dashboard/senha.js` já faz hash `scrypt` sem dependência nativa nova.
- O admin tem o requisito `Sem JavaScript de cliente` em `admin-operacao`, e ele diz
  literalmente "**toda ação do admin**". A página pública não é o admin — ver (h).

## Goals / Non-Goals

**Goals:**

- Um caminho de conversa só, exercitado por dois transportes.
- Continuar funcionando para quem está no WhatsApp, sem mudança perceptível.
- Ninguém entra sem ter sido convidado.
- A primeira porta pública do projeto abrir com o mínimo de superfície possível.

**Non-Goals:**

- **Notificação push (Web Push).** O canal web é só reativo. Ver a decisão abaixo.
- Substituir o WhatsApp como canal principal.
- Recuperação de acesso por e-mail ou SMS.
- Áudio e anexo pela web — a transcrição continua sendo caminho do WhatsApp.
- Conversa simultânea nos dois canais tratada como coisa especial: é a mesma pessoa,
  o mesmo estado de anamnese e o mesmo histórico, por construção.

## Decisions

### O núcleo é extração, não reescrita

`processarPassoAnamnese` e `processarMensagemNormal` já recebem `enviarMensagem` e já
aceitam dependências injetadas. O que os prende ao WhatsApp é o começo de
`tratarMensagemRecebida`: o formato `{numero, texto, audio}`, a transcrição e o
`findByWhatsapp`.

Então a divisão é natural:

- **Adaptador** (por canal): identificar a pessoa, obter o texto (transcrever, no caso
  do WhatsApp), e entregar uma função de envio.
- **Núcleo** (único): decidir se é anamnese ou chat livre, registrar a interação,
  classificar, montar o prompt, chamar o LLM e devolver o que responder.

**Nenhum adaptador pode reimplementar decisão do núcleo.** É a regra que impede a web
de virar um segundo produto com a mesma marca — que é exatamente o que aconteceria se
alguém copiasse "só o pedacinho da anamnese" para a rota HTTP.

A rede de segurança do usuário desconhecido (hoje no `tratarMensagemRecebida`)
**fica no adaptador do WhatsApp**, e não sobe para o núcleo: na web, mensagem de quem
não existe não é caso a tratar — é sessão inválida, que a autenticação já barrou.

### O canal web roda no processo do bot, não no dashboard

O `tars` tem o que a conversa precisa: banco, router de LLM, prompts, máquina de
estados. O `dashboard` teria que falar com ele por uma API nova entre containers, e
essa API seria uma superfície a mais para manter, autenticar e versionar — para
transportar a mesma chamada que hoje é um `import`.

Consequência assumida: **o processo do bot passa a escutar uma porta pública**. Era um
processo sem porta nenhuma. Ver os riscos.

O servidor web é um Express separado do admin, em porta própria, com o admin
continuando em `127.0.0.1:3300`. Misturar os dois no mesmo Express faria uma
configuração errada de rota expor dado de saúde de todo mundo; portas e processos
diferentes tornam esse erro impossível em vez de improvável.

### Entrada: telefone + data de nascimento, e nunca criação

A rota de entrada **valida contra quem já existe** e falha para todo o resto. Não há
caminho de autocadastro, nem para quem acertar um telefone válido.

O par identificador/segredo é fraco por natureza — data de nascimento tem ~15 mil
valores plausíveis para um adulto, e telefone não é segredo. Por isso o limite de
tentativas da decisão (a) não é formalidade: é a única coisa entre o par e a força
bruta. A resposta de falha é **sempre a mesma**, exista o telefone ou não: distinguir
"telefone não cadastrado" de "data errada" transformaria a rota num verificador de
quem está no piloto — que é, por si só, dado de saúde.

O motivo de aceitar um par fraco: o público. Exigir senha de quem tem TDAH, no
primeiro contato, é o atrito que faz a pessoa não voltar. A data de nascimento é algo
que ela sabe sem procurar.

### Anamnese pela web usa o mesmo conteúdo, só troca o transporte

`PERGUNTAS`, `TEXTO_CONSENTIMENTO`, `PEDIDO_DE_EXEMPLO`, `TEXTO_CONCLUSAO` continuam
vindo de `src/anamnese/questions.js`. Nenhum texto é reescrito para a web.

Se a Fase 2 mover esses textos para o conteúdo versionado, a web herda a mudança sem
tocar em nada — porque lê pela mesma função, não por uma cópia.

O consentimento aceito pela web **é o mesmo consentimento**: mesma versão, mesma
coluna, mesmo registro. Não existe "consentimento web".

### O convite vira o ponto único de pré-cadastro

`convidarPiloto` passa a receber a data de nascimento e gravá-la. O envio da mensagem
de WhatsApp continua sendo o que ele sempre fez, e **continua acontecendo** — quem for
usar a web também foi convidado por lá, e o convite é o que põe a pessoa no estado 0.

Convidar alguém que só vai usar a web sem mandar mensagem nenhuma seria um segundo
fluxo de cadastro, com um segundo conjunto de regras sobre quando o estado 0 começa.
Um caminho só, com um efeito só.

### Sem push, e isso é uma decisão de produto

O mecanismo central do TARS é **chegar antes**: o check-in da manhã, o lembrete do
remédio, o checklist do fim do dia. Nada disso funciona num canal que só responde.

Web Push resolveria tecnicamente e traria junto: chaves VAPID, service worker,
permissão do navegador (que este público nega com frequência), entrega que falha em
silêncio quando a aba está fechada, e comportamento diferente em cada navegador — sem
nenhuma garantia de chegada, que é justamente o que um lembrete de remédio precisa ter.

Então a divisão fica explícita, e é a coisa mais importante deste documento para quem
for implementar: **a web é onde a pessoa procura o TARS; o WhatsApp é onde o TARS
procura a pessoa.** O scheduler não ganha canal novo, e não deve ser "consertado" para
ganhar.

### Migração de coluna, não recriação de volume

`data_nascimento` e `canal` entram em tabelas que já existem, e `CREATE TABLE IF NOT
EXISTS` não altera tabela existente. `sessoes_web` é tabela nova e entra sozinha.

`ALTER TABLE ... ADD COLUMN` o SQLite suporta — não é o caso do CHECK constraint, que
exige recriar a tabela. Então a migração aqui é simples, e mesmo assim idempotente:
consulta `PRAGMA table_info` antes de acrescentar.

`canal` nasce com padrão `whatsapp`, e não nulo: toda linha que já existe veio de lá,
e deixar nulo obrigaria toda consulta a tratar o caso.

## Risks / Trade-offs

**A primeira porta pública do projeto.** Até aqui, nada deste sistema era alcançável
sem túnel ou proxy autenticado. O canal web é público por definição, e serve conversa
com dado de saúde. Mitigações: sessão curta com token em hash, limite de tentativas
duplo, resposta de erro indistinguível, nenhuma criação de usuário, e nenhuma rota que
liste participantes.

**O par telefone + data de nascimento é fraco.** Quem souber o telefone de alguém do
piloto tem ~15 mil tentativas para fazer, e o limite as reduz a 5 por 15 minutos por
telefone — o que dá anos, mas não é impossível. Se o piloto crescer, isto é a primeira
coisa a trocar.

**O processo do bot ganha responsabilidade.** Um erro no servidor web derruba junto o
WhatsApp e o scheduler, que hoje são independentes de qualquer porta. O tratamento de
erro do Express precisa ser explícito, e o servidor não pode derrubar o processo.

**Dois canais, um estado de anamnese.** A mesma pessoa pode responder o estado 4 pelo
WhatsApp e o 5 pela web. Isso é desejado — é a mesma conversa —, e significa que o
registro precisa dizer por onde cada resposta veio, senão a leitura do histórico fica
sem sentido. É o motivo da coluna `canal`.

**Mais uma superfície para o mesmo LLM.** O custo por mensagem não muda, mas o número
de mensagens pode subir: conversar por navegador é mais barato para a pessoa do que
abrir o WhatsApp. Na escala do piloto, irrelevante.

---

## Decisões do dono do projeto

### (a) Limite de tentativas na entrada pública

**DECIDIDO: 5 falhas em 15 minutos, por IP E por telefone**, com atraso de 1 segundo a
cada falha — os mesmos números que `src/dashboard/auth.js` já usa no login do admin.

O contador **por telefone** é o que difere do admin, e é o que importa: o IP chega por
proxy e é forjável no cabeçalho; o telefone é o alvo real e não se forja. As duas
contagens valem ao mesmo tempo, e qualquer uma delas bloqueia.

Opções que estavam na mesa: 3 falhas/1 hora por telefone (mais rígido, e trancaria por
uma hora quem só errou o formato da data — num público que erra formato de data com
frequência); 10 falhas/15 min (mais folgado); e só o atraso progressivo, sem bloqueio
(nunca pune a pessoa certa, e cede à força bruta paciente).

### (b) Onde vive a sessão web

**DECIDIDO: tabela nova `sessoes_web` no SQLite**, com `token_hash`, `usuario_id`,
`criado_em` e `expira_em`.

Guarda o **hash** do token, nunca o valor — mesmo princípio da senha do admin: quem
lê o banco não consegue se passar por ninguém. Vive no SQLite, e não na memória do
processo como a sessão do admin, porque **todo deploy deslogaria todo mundo no meio da
anamnese** — que é exatamente o momento em que a pessoa tem mais a perder e menos
paciência para recomeçar.

Não em colunas de `usuarios`: seria uma sessão por pessoa (entrar no celular derrubaria
o computador) e misturaria credencial de acesso com dado de saúde na mesma linha.

Expirados são apagados de verdade — sessão não é rastro de auditoria, é credencial
vencida. O que fica registrado no histórico é a **entrada**, não o token.

**Validade: 6 horas de INATIVIDADE**, renovadas a cada requisição válida. O número
não estava fixado quando esta decisão foi tomada e fica registrado aqui.

Inatividade, e não tempo absoluto desde a entrada: uma conversa que dura o dia todo não
deve ser interrompida no meio, e uma aba esquecida aberta não deve valer para sempre.
Seis horas cobrem um turno de uso — quem conversa de manhã e volta à noite entra de
novo uma vez, o que é aceitável; quem está no meio da anamnese não é interrompido.

Menos que isso obrigaria a redigitar telefone e data com frequência, num público em que
cada atrito custa a próxima mensagem. Mais que isso deixaria uma credencial de acesso a
dado de saúde viva num computador emprestado por tempo demais.

**Expirar a sessão nunca apaga histórico.** A sessão é a chave da porta, não a conversa:
quem reentra encontra a anamnese no mesmo estado e o histórico intacto.

O hash do token é **SHA-256**, não `scrypt`. O `scrypt` de `src/dashboard/senha.js`
existe para senha escolhida por gente — segredo de pouca entropia, onde o custo
deliberado é o que inviabiliza dicionário. O token aqui é aleatório de 192 bits: não há
dicionário a fazer, e pagar ~100 ms de derivação **em toda mensagem** seria latência
inventada. O que se quer do hash é só que um banco vazado não contenha credencial
utilizável, e SHA-256 entrega exatamente isso.

### (i) Tipo da entrada no histórico, e o canal das linhas que não são mensagem

**DECIDIDO: tipo novo `entrada_web`.** Reaproveitar `acao_admin` faria a página do
participante exibir o acesso dele como se fosse ação da equipe — exatamente a distinção
que a auditoria existe para manter. Custo assumido: o CHECK é lista fechada, então isso
exige a migração completa de constraint. O banco de produção estava com zero linhas de
participante quando esta decisão foi tomada — a janela mais barata que vai existir.

**DECIDIDO: as linhas de `acao_admin` ficam com o `canal` padrão, e a interface não
exibe canal para elas.** O valor existe no banco por ser `NOT NULL`, mas nunca é
mostrado nem consultado para esse tipo. As alternativas eram acrescentar `admin` aos
valores de canal (mais uma migração de CHECK para um valor que só serve de rótulo) ou
tornar a coluna anulável (obrigando toda consulta futura a tratar o nulo, que é
justamente o que a escolha por `NOT NULL` com padrão evitou).

### (c) → (h) JavaScript de cliente na página pública

**DECIDIDO: sim, na página pública; a invariante continua valendo para o admin.**

`fetch` para enviar e receber, sem framework e sem build. Sem isso, cada mensagem
recarregaria a página inteira, piscando e perdendo o foco do campo — atrito que este
produto existe para evitar.

Isto **não contraria** nenhuma spec aprovada: o requisito `Sem JavaScript de cliente`
vive em `admin-operacao` e diz "toda ação **do admin**". O admin é ferramenta interna,
para um operador, atrás de login, onde o custo de um reload é zero e o de uma
dependência é permanente. A página pública é outra superfície, com outro público.

A opção que estava na mesa era estender a invariante: formulário POST comum, histórico
renderizado no servidor, zero JavaScript no projeto inteiro. Mais simples de manter, e
paga com o atrito exatamente no público menos capaz de absorvê-lo.

O JavaScript aqui tem limite explícito, registrado como requisito: sem framework, sem
etapa de build, sem dependência externa, e a página **não pode** conter regra de
negócio — ela envia texto e desenha o que voltou.
