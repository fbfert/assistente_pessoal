# Design — Base de técnicas práticas

## O problema, em uma frase

A Regra 3 manda sugerir a ação mínima seguinte, mas o modelo não tem **matéria
prima** para dizer qual é. Sem conteúdo concreto, ele produz forma sem conteúdo
— ou pior, procura a única coisa específica que enxerga no contexto, que é o
remédio da pessoa.

## Decisões tomadas

### 1. Taxonomia fechada, em tabela, semeada com sete temas

`iniciar_tarefa`, `foco_distracao`, `gestao_tempo`, `ambiente_sensorial`,
`sono`, `energia_fadiga`, `transicao_atividade`.

**Fechada e editável não se contradizem aqui.** Fechada quer dizer que a técnica
escolhe o tema de uma lista, nunca digita um: se qualquer palavra pudesse virar
tema, a classificação por palavra-chave viraria adivinhação e a curadoria
perderia o critério de "onde isto se encaixa". Editável quer dizer que o
operador pode acrescentar tema e, principalmente, palavra-gatilho — porque as
palavras que as pessoas do piloto realmente usam só aparecem lendo as conversas
delas, e esperar deploy para acrescentar "empacado" transformaria ajuste
editorial em tarefa de programação.

Palavras-gatilho ficam em coluna de texto, **uma por linha**. Tabela filha
acrescentaria CRUD, ordenação e deduplicação para uma lista que é sempre lida
inteira e nunca consultada por elemento. JSON acrescentaria uma sintaxe que o
operador teria de acertar a mão num `<textarea>` sem JavaScript — vírgula
esquecida viraria erro de sistema.

Sete é escolha deliberada. Poucos o bastante para as palavras-gatilho não se
atropelarem, e cobrindo o dia a dia executivo sem encostar em nada clínico.

**`sobrecarga_crise` ficou de fora, e o motivo importa.** É o tema que mais
puxa para o clínico, e a Regra 5 do núcleo manda **reduzir** a exigência em
momento de crise. Oferecer técnica ali trabalharia contra a própria regra: a
pessoa em sobrecarga não precisa de um método, precisa de menos coisa para
fazer. Acrescentar o tema depois é uma linha na tabela; desfazer o dano de
sugerir método a quem está em crise, não.

### 2. Classificação determinística, sem LLM

Mesma escolha de `src/classify/heuristic.js`, e pelo mesmo motivo: uma chamada
de modelo por mensagem só para rotular a mensagem seria custo recorrente sem
retorno de produto. A diferença em relação ao aprendizado contínuo é real — lá
a chamada extra compra algo que heurística não consegue (extrair um fato novo
de texto livre); aqui, casar "não consigo começar" com o tema `iniciar_tarefa`
é exatamente o que palavra-chave faz bem.

Cada tema carrega uma lista de expressões-gatilho. O texto passa por
`normalizar()` (o mesmo do resto do projeto: sem acento, minúsculo, espaço
colapsado) e casa por **substring sobre o texto normalizado**, não por Set de
igualdade exata.

Isso é uma exceção consciente à regra do Set fechado do AGENTS §4, e a diferença
é de natureza: aquela regra existe para **resposta a pergunta fechada**, onde
"pode me chamar de Ana" não pode contar como "pode". Aqui não há pergunta e não
há máquina de estados para descolar — é texto livre, e o pior caso de um falso
positivo é uma sugestão fora de hora que a pessoa ignora. O melhor caso de
exigir igualdade exata seria nunca casar nada.

Empate entre temas: **o de maior número de expressões casadas**; persistindo,
a ordem da taxonomia. Determinístico, testável, sem sorteio.

### 3. No máximo UMA técnica por resposta

O contexto ganha uma técnica, nunca uma lista. Duas viram cardápio, e cardápio
é exatamente o oposto da regra de ouro do input mínimo: a pessoa que não
consegue começar uma tarefa não vai escolher entre três métodos de começar.

### 4. Rodízio — sai a menos sugerida recentemente **(decisão a)**

Entre as publicadas do tema, sai a de `ultima_sugerida_em` mais antiga; nula
(nunca sugerida) vem primeiro. Desempate por `tecnica_id`.

Alternativas descartadas: **aleatória** custa nada mas, com duas ou três
técnicas por tema, repete — e ouvir a mesma frase três dias seguidos é o que faz
o produto soar automático, que é justamente o defeito que esta mudança existe
para corrigir. **Mais nova primeiro** congela a base numa pilha onde só o topo
circula, e material antigo curado nunca chega a ser avaliado.

O rodízio precisa saber quando cada técnica saiu — e é o mesmo registro que a
decisão (b) pede. Uma escrita serve às duas.

### 5. A sugestão é auditada, com tipo próprio **(decisão b)**

Toda técnica injetada no contexto SHALL gerar linha em `historico_interacoes`
com `tipo = 'tecnica_sugerida'`.

Vale a pena: o piloto existe para avaliar conteúdo, e sem esse registro não há
como responder "quais técnicas realmente circularam?" nem "qual nunca saiu?".
Um contador na própria técnica responderia a primeira pergunta mais barato, mas
perde o **quando** e o **para quem** — e é justamente cruzar a técnica com a
conversa em que ela apareceu que diz se ela funcionou.

O registro é da **injeção no contexto**, não da resposta final: o sistema sabe o
que ofereceu ao modelo, e não tem como afirmar que o modelo usou. O texto da
linha SHALL deixar isso explícito, para ninguém ler o histórico como prova de
que a pessoa recebeu aquela técnica.

### 6. Rascunho e publicada, com fonte

Técnica nasce `rascunho` e só entra em uso como `publicada`. Espelha
`prompts_versionados`: conteúdo que afeta o que a pessoa lê não muda sem passo
explícito de quem cura.

`fonte` é obrigatória e é texto livre — livro, artigo, "experiência do piloto".
Não é campo de bibliografia acadêmica; é o rastro de onde aquilo veio, para que
daqui a seis meses ninguém precise adivinhar se a técnica foi curada ou inventada.

`arquivada` é o terceiro estado. Técnica publicada **não é apagada**: sai de
circulação e permanece, porque o histórico aponta para ela.

### 7. Onde a busca acontece, e por que não há FTS5

`src/conhecimento/` — módulo próprio: `temasRepo.js`, `tecnicasRepo.js` e
`classificarTema.js`, este último puro (recebe texto e temas, não importa
banco). Ficam fora de `src/db/` de propósito: `temasRepo` e `tecnicasRepo`
existem para uma capacidade só, e agrupá-los com o repositório de participante
esconderia que são a mesma coisa.

**FTS5 estava na proposta original e não foi construído.** Ele resolveria
"achar a técnica cujo TEXTO casa com a mensagem". O desenho que ficou de pé não
faz isso: classifica o tema e depois escolhe entre as publicadas **daquele
tema**, por rodízio. Não sobra nenhuma busca textual para o FTS5 fazer — um
índice de texto completo sobre uma tabela que nunca é consultada por texto seria
peso morto que ainda precisa ser mantido em sincronia a cada escrita. Se um dia
a seleção passar a olhar o texto da técnica, ele entra; hoje não tem função.

### 8. Ordem no núcleo, e por que não é paralela

A busca acontece **antes** do `Promise.all`, porque o resultado dela entra no
prompt da chamada de resposta. É consulta local a SQLite com índice — ordem de
microssegundos, não de rede. Não há motivo para paralelizar, e paralelizar seria
impossível: a resposta depende dela.

## Riscos assumidos

- **Falso positivo de tema.** "Não consigo dormir de tanta coisa na cabeça" casa
  `sono` e talvez `foco_distracao`. A técnica sai levemente fora de foco e a
  pessoa ignora. Aceitável — é sugestão opcional, não instrução.
- **Base vazia é o estado inicial, e está certo.** Sem técnica publicada, o
  comportamento é exatamente o de hoje. Nada quebra; a mudança só passa a valer
  quando alguém curar conteúdo.
- **A tela permite escrever conteúdo clínico.** O aviso é não bloqueante e a
  responsabilidade é de quem cura. Bloquear por lista de palavras daria falsa
  garantia: "respiração" é sensorial e prático, "técnica de respiração para
  ansiedade" não é, e nenhuma lista separa os dois.
