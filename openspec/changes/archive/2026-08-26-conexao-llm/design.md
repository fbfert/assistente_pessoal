## Context

`tars` e `dashboard` são containers separados que compartilham **apenas** o volume
`tars_data`, montado em `/data`. Ambos rodam como `root` na mesma imagem.

`env_file: .env` do Compose é lido **uma vez**, quando o container sobe: o Docker
injeta as variáveis no processo. Não é um arquivo que o processo consiga reabrir
para ver mudanças, e escrever num `.env` de dentro do container não alcança o
outro container nem sobrevive a um rebuild.

A Fase 2 (`admin-backend-fase2`, ainda não implementada) registra como não-objetivo
explícito "chave de API na interface, em qualquer forma", e mantém as credenciais
fora de `config_global`. Esta mudança **não contradiz** aquela decisão: ela mantém
a credencial fora da configuração viva e fora do banco, e resolve o problema por
outro caminho.

## Goals / Non-Goals

**Goals:**

- Rotacionar uma chave sem SSH e sem reinício.
- Nunca devolver a chave depois de gravada.
- Fechar o vazamento em potencial pelo corpo do erro — no router e na transcrição.
- Cobrir os três provedores, não só um.
- Saber se a credencial funciona antes de um participante descobrir por você.
- Dar tela ao modelo de transcrição, que nunca teve nenhuma.

**Non-Goals:**

- Histórico e reversão de chave — ver Decisões.
- Validar a chave contra o provedor no momento de salvar.
- Trocar a **chave** de transcrição, que continua sendo a mesma da seção OpenAI.
- Trocar o **provedor** de transcrição: continua OpenAI, sempre.
- Lista fechada de modelos — a lista é atalho, nunca restrição.
- Múltiplos conjuntos de credenciais, por ambiente ou por participante.

## Decisions

### Tela própria, não dentro da tela de IA

A Fase 2 ainda não foi implementada (`0/49 tasks`), então a tela de IA/Persona não
existe para receber uma seção. Mesmo que existisse, a separação se justifica: a
tela de IA é sobre **comportamento** — texto que se edita, versiona e reverte
livremente; esta é sobre **credencial** — valor que se escreve e nunca mais se lê.
Misturar as duas convida ao erro de aplicar a uma o modelo mental da outra.

Se a Fase 2 for implementada depois, a tela de IA linka para esta.

### Arquivo no volume, não `.env` e não SQLite

**Não `.env`:** é lido uma vez na subida do container. Escrever nele de dentro do
processo não alcança o outro container e some no próximo rebuild.

**Não SQLite:** a credencial passaria a viver na mesma tabela genérica que várias
telas consultam, e num banco que tem "ver histórico" como funcionalidade. Quanto
menos código consegue ler o valor, menor a chance de um bug expô-lo. O banco também
é o que se copia em backup e o que se inspeciona quando algo dá errado.

`/data/llm-chaves.json`, com permissão `0600`. O modo é aplicado na escrita; o
volume Docker o preserva. Como os dois containers rodam como o mesmo usuário,
`0600` não impede o bot de ler — impede qualquer outro usuário que venha a existir.

Formato:

```json
{
  "ativo": "claude",
  "claude":   { "apiKey": "...", "model": "claude-sonnet-5" },
  "openai":   { "apiKey": "...", "model": "gpt-4o", "transcriptionModel": "gpt-4o-transcribe" },
  "deepseek": { "apiKey": "...", "model": "deepseek-chat" }
}
```

`ativo` fica fora do mapa de provedores, no topo: é escolha de qual usar, não
credencial de ninguém. `transcriptionModel` existe só em `openai`, porque a
transcrição é sempre OpenAI e usa a chave que já está ali — não é uma credencial
separada e não deve parecer uma.

### Escrita atômica

O admin escreve enquanto o bot pode estar lendo. Escrever direto sobre o arquivo
deixa uma janela — de milissegundos, mas real — em que o bot lê JSON truncado e
falha a chamada.

A escrita grava num arquivo temporário no mesmo diretório e o renomeia por cima.
`rename` dentro do mesmo sistema de arquivos é atômico: o leitor vê ou o conteúdo
antigo inteiro, ou o novo inteiro, nunca metade.

### Leitura ao vivo por horário de modificação

Cada processo mantém o conteúdo em memória e guarda o `mtime` que leu. Antes de
servir o valor, um `fs.stat` confirma se o arquivo mudou; se mudou, relê.

É o mesmo princípio do `MAX(atualizado_em)` que a Fase 2 usa para configuração no
banco, adaptado para arquivo: uma chamada barata de metadados por uso, em vez de
reler o conteúdo. Sem isso, trocar a chave pelo admin não alcançaria o bot até o
próximo reinício — e ninguém teria como perceber, porque o admin mostraria a chave
nova como configurada enquanto o bot seguiria usando a antiga.

### Ordem de resolução em dois degraus

1. o arquivo, se tiver aquele provedor configurado;
2. a variável de ambiente correspondente.

Vale para os quatro valores que o arquivo passa a guardar: a chave, o modelo de
conversa, o provedor ativo (`LLM_PROVIDER`) e o modelo de transcrição
(`TRANSCRIPTION_MODEL`).

**Não há terceiro degrau.** A configuração viva da Fase 2 tem três porque existe
constante de fábrica no código; uma credencial não tem — e não deveria. Faltando
os dois, a chamada falha com erro dizendo qual variável **ou** qual campo da tela
preencher.

O erro é explícito de propósito: falhar em silêncio, ou cair noutro provedor por
conta própria, faria o piloto responder com um modelo que ninguém escolheu.

### Sem histórico, sem reversão — e por isso confirmação em duas etapas

Toda outra configuração deste admin tem histórico e reversão. Esta **não tem**, de
propósito: guardar a chave anterior significaria manter uma credencial provavelmente
revogada, num lugar consultável, para nunca usá-la.

A consequência é que sobrescrever é irreversível. Por isso, sobrescrever uma chave
já configurada passa por confirmação em duas etapas — a mesma que o projeto já usa
para ação destrutiva. Configurar pela primeira vez não precisa: não há o que perder.

### O erro nunca carrega o corpo bruto

`src/llm/router.js` hoje monta a exceção com o corpo da resposta de erro. Alguns
provedores ecoam a credencial recebida no 401, e a exceção vira log do Docker.

Passa a registrar apenas provedor e código de status. O corpo é descartado — sem
tentar filtrar a chave dele, porque filtrar exige acertar o formato de cada
provedor a cada mudança de API, e errar uma vez basta para vazar.

Perde-se detalhe de diagnóstico. É troca aceita: o código de status distingue os
casos que importam (401 credencial, 429 cota, 5xx provedor fora).

### O valor completo não sai do repositório de credenciais

O módulo expõe `status(provider)`, que devolve apenas
`{ configurado, ultimosCaracteres, model }`. A chave inteira só é devolvida por
`ler(provider)`, chamada exclusivamente pelo router.

A tela nunca recebe o valor: o campo de chave é write-only e carrega vazio, mesmo
para quem acabou de salvar. Não há caminho de leitura para a interface, e portanto
não há como um template exibi-lo por engano.

### Auditoria exige um valor novo no CHECK, e uma migração de verdade

`auditoria_admin.acao` tem lista fechada. Registrar troca de credencial exige
acrescentar um valor a ela.

**Correção a este próprio documento:** a versão inicial afirmava "Schema: nenhum".
Estava errada — as credenciais não tocam o banco, mas a auditoria delas toca.

E, pela primeira vez neste projeto, **recriar o volume não é o caminho**. Até
agora foi, porque o banco estava vazio. Hoje ele contém a conta de administrador
com a senha que o operador definiu; recriar faria o bootstrap restaurá-la a partir
do `ADMIN_PASSWORD` do `.env`, que ainda é a senha antiga — desfazendo a troca sem
nenhum aviso.

A migração segue o procedimento que o `AGENTS.md` §6 descreve: dentro de uma
transação e com `PRAGMA foreign_keys=OFF`, cria-se a tabela nova com a constraint
atualizada, copiam-se os dados, dropa-se a antiga e renomeia-se. O
`foreign_keys=OFF` é o que impede o `DROP` de disparar CASCADE sobre as filhas.

O script SHALL ser idempotente: detecta pela definição da tabela se o valor já
existe e não faz nada nesse caso. `schema.sql` também é atualizado, para que uma
instalação nova já nasça correta sem depender do script.

### Modelo por lista curada, com campo livre ao lado

**Revisa a decisão anterior deste documento**, que dizia texto livre puro. O
problema do texto livre não é o modelo novo — é o comum: digitar `claude-sonet-5`
e só descobrir na primeira conversa real, com um participante do outro lado.

A lista de cada provedor sai dos valores que o próprio projeto já usa como padrão
em `src/config.js` (`claude-sonnet-5`, `gpt-4o`, `deepseek-chat`), lidos de lá e
não redigitados no HTML — duas listas independentes divergem na primeira troca de
padrão.

A fuga continua existindo, e **sem JavaScript**: o campo de texto livre fica
sempre visível ao lado do seletor, com a regra de que **preenchido, ele vence**.
Não é um campo que aparece ao escolher "outro" — é um campo que está sempre lá.
Custa uma linha de explicação na tela e não custa a invariante de não ter JS de
cliente. Ver a decisão (g).

O modelo salvo que não estiver na lista SHALL aparecer selecionado assim mesmo:
quem configurou `claude-opus-4-1` por texto livre não pode abrir a tela e ver
`claude-sonnet-5` como se fosse o valor gravado.

### Testar sem persistir, com rascunho ou com a chave salva

Rota própria (`POST /credenciais/:provider/testar`), **separada da de salvar**, que
nunca escreve no arquivo. Faz uma chamada real mínima — uma mensagem pedindo `ok`,
com teto de tokens baixo — e devolve sucesso com a latência, ou a falha.

De onde vem a chave: **do rascunho, se o campo de chave daquele formulário tiver
algo digitado; da chave já salva, se estiver vazio.** É o mesmo princípio que a
Fase 2 adotou no teste de persona — testar o que está na tela, não o que está
gravado —, e aqui ele é ainda mais necessário: o campo é write-only, então sem
essa regra não haveria como validar uma chave **antes** de substituir a atual,
que é justamente o momento em que o erro custa caro.

O mesmo vale para o modelo: testa o que estiver selecionado (ou digitado) no
formulário.

**Sem limite de taxa formal**, ao contrário do teste de persona da Fase 2. São
coisas diferentes: aquele é calibração, repetida dezenas de vezes numa sessão de
ajuste de texto; este é conectividade — clica-se uma vez depois de colar uma
chave. A proteção contra o clique duplo é que a rota **não persiste nada**: dois
cliques custam duas chamadas de uma palavra e nenhum estado inconsistente. Ver a
decisão (g) sobre por que o botão não é desabilitado por JavaScript.

O resultado do teste **não** é auditado: nada mudou. O que se audita é gravação.

### Transcrição: mesma chave, segundo modelo

`config.transcription.apiKey` já era `OPENAI_API_KEY` desde o primeiro dia — é a
mesma conta da seção OpenAI, não uma credencial separada. O que falta não é chave,
é **onde escolher o modelo**.

O registro do provedor `openai` no arquivo ganha um campo a mais,
`transcriptionModel`, e `config.transcription.model` passa a resolvê-lo pelo mesmo
caminho de dois degraus: arquivo, depois `TRANSCRIPTION_MODEL` do ambiente.

Fica na seção da OpenAI, não numa seção própria, exatamente porque compartilha a
chave: uma seção separada sugeriria uma credencial separada, que é o erro que a
tela deve evitar induzir. A nota abaixo do campo diz, na tela, que a transcrição
usa sempre a OpenAI **independentemente do provedor ativo na conversa** — regra que
não muda com esta mudança; ela só ganhou onde ser configurada.

### O eco do corpo bruto também está na transcrição

Ao trazer a transcrição para esta tela, apareceu o mesmo defeito que motivou a
decisão sobre o erro do router: `src/transcription/transcribe.js` devolve
`OpenAI respondeu ${status}: ${await resposta.text()}` — o corpo bruto — e o
handler o escreve em `console.error`. É o mesmo 401 que pode ecoar a credencial, no
mesmo log do Docker, por um caminho que a correção do router não cobriu.

Passa a registrar só provedor e código de status, pela mesma razão e com a mesma
troca: perde-se detalhe de diagnóstico, e o código de status distingue os casos que
importam.

### Provedor ativo escolhido aqui — e o conflito com a Fase 2

Ver a decisão (f). O provedor ativo passa a ser escolhido nesta tela, gravado no
próprio arquivo de credenciais (uma chave `ativo`, fora do mapa de provedores), e
resolvido na mesma ordem de dois degraus: arquivo, depois `LLM_PROVIDER`.

**Conflito registrado, não resolvido por conta própria:** o delta `llm-provider` da
mudança `admin-backend-fase2` afirma que "o provedor ativo passa a vir da
configuração viva". Com esta decisão, ele passa a vir daqui. Duas telas editando o
mesmo botão, cada uma numa fonte de verdade diferente, seria pior que qualquer uma
das duas sozinha — quem mudasse numa não veria efeito nenhum e não teria como
entender por quê. Aquele delta precisa ser revisado antes de a Fase 2 ser
implementada; a revisão é daquela mudança, não desta.

## Risks / Trade-offs

**Backup do volume passa a conter credenciais.** Antes, o volume tinha dado de
saúde e a sessão do WhatsApp; agora tem também chaves de API de terceiros. Quem
copiar o volume copia isso junto — vale para snapshot de disco também.

**Recriar o volume apaga as credenciais.** O README já documenta a recriação para
mudança de schema. Passa a apagar mais uma coisa, e a tela é o único caminho de
volta.

**O modelo aceita texto livre.** A lista curada cobre o caso comum, e o campo ao
lado aceita qualquer coisa — inclusive um nome errado, que só falha na primeira
chamada. Agora existe o botão de testar, que transforma "descobrir com um
participante do outro lado" em "descobrir em dois segundos" — desde que alguém
clique. Validar contra a API a cada gravação resolveria de vez, e cobraria uma
chamada paga em toda gravação, inclusive nas que só mudam o modelo.

**Menos detalhe no erro de provedor.** Descartar o corpo custa diagnóstico. O
código de status cobre os casos frequentes.

**A tela concentra as três credenciais.** Quem alcança o admin alcança a
capacidade de trocar todas. Já era verdade para quem tinha SSH; agora vale para
quem tem a senha do admin, que é uma superfície maior.

**O botão de testar gasta dinheiro.** Chamada real, paga, a cada clique. É uma
mensagem de uma palavra com teto de tokens baixo — desprezível na escala do
piloto —, mas é a segunda funcionalidade do admin com custo por uso, depois do
teste de persona da Fase 2.

**A tela de teste aceita chave digitada e não gravada.** É o que permite validar
antes de substituir, e significa que uma credencial trafega no corpo de um POST
que não vai persistir nada. Vale o mesmo cuidado do resto: não logar corpo de
requisição, não ecoar em mensagem de erro.

---

## Decisões do dono do projeto

As perguntas abaixo foram levantadas depois da proposta original e **respondidas**.
Ficam registradas com as opções que estavam na mesa.

### (f) Quem fica com o seletor de provedor ativo

**DECIDIDO: fica nesta tela; a Fase 2 abre mão.** Rádio único, compartilhado pelas
três seções, gravado no arquivo de credenciais e resolvido antes de `LLM_PROVIDER`.

O que decidiu foi a coerência do gesto: escolhe-se o provedor ativo no mesmo lugar
e no mesmo momento em que se dá a chave a ele. O custo é que o delta `llm-provider`
da Fase 2 precisa ser revisado — registrado acima e na proposta.

Opções que estavam na mesa:

**Opção 1 — fica aqui, a Fase 2 abre mão.** ← escolhida Uma fonte de verdade só,
no lugar onde a credencial já vive. Custo: revisar um delta de outra mudança ativa.

**Opção 2 — fica aqui, e a Fase 2 ganha precedência depois.** Três degraus
(`config_global` → arquivo → ambiente), funcionando em qualquer ordem de
implementação. Custo: duas telas editando o mesmo botão, e quem mudar na tela
errada não vê efeito nenhum.

**Opção 3 — continua só indicando.** Zero conflito, e contraria o escopo pedido:
a escolha continuaria sendo `LLM_PROVIDER` no `.env` até a Fase 2 chegar.

### (g) JavaScript de cliente nesta tela

**DECIDIDO: sem JavaScript.** A invariante do projeto — nenhuma tela do admin tem
JS de cliente — vale também aqui.

Consequências concretas, todas assumidas:

- O campo de modelo livre fica **sempre visível** ao lado do seletor, em vez de
  aparecer ao escolher "outro". Preenchido, vence o seletor.
- O teste é um POST comum que **recarrega a tela** com o resultado no bloco daquele
  provedor, em vez de escrever inline sem recarregar.
- O botão de testar **não é desabilitado** enquanto a chamada está pendente. O que
  torna isso aceitável é a rota não persistir nada: clique duplo custa duas
  chamadas de uma palavra, não um estado inconsistente.

Opções que estavam na mesa:

**Opção 1 — sem JS.** ← escolhida Mantém a invariante que sustenta, entre outras
coisas, a confirmação de duas etapas em página GET no lugar de um `confirm()`.

**Opção 2 — JS mínimo inline, só nesta tela.** Entregaria exatamente o
comportamento descrito no enunciado — revelar campo, desabilitar botão, resultado
inline. Custo: abre precedente para JS em qualquer tela e obriga a corrigir o
`AGENTS.md`, que hoje afirma o contrário.
