## ADDED Requirements

### Requirement: Taxonomia de temas em lista fechada

O sistema SHALL manter os temas numa lista própria, cada um com chave estável,
rótulo legível e palavras-gatilho usadas na classificação.

A lista SHALL ser semeada com sete temas: `iniciar_tarefa`, `foco_distracao`,
`gestao_tempo`, `ambiente_sensorial`, `sono`, `energia_fadiga` e
`transicao_atividade`.

O rótulo e as palavras-gatilho de um tema SHALL ser editáveis pelo admin, sem
alteração de código.

A lista SHALL ser fechada do ponto de vista da técnica: o tema de uma técnica
SHALL vir da lista, e SHALL NOT ser campo de texto livre no formulário.

Criar tema novo SHALL ser ação deliberada do operador numa tela própria, e SHALL
NOT acontecer como efeito colateral de cadastrar técnica.

A chave de um tema SHALL ser única.

Motivo registrado: fechada é o que faz a classificação por palavra-chave
funcionar sem virar bagunça, e é o inventário do que está autorizado a existir
na base — sem isso ela vira um blog de autoajuda genérico com o tempo. Editável
porque as palavras que as pessoas do piloto usam de verdade só aparecem depois
de lê-las conversando, e esperar deploy para acrescentar "empacado" seria
transformar ajuste editorial em tarefa de programação.

#### Scenario: Os sete temas existem na primeira subida
- **WHEN** o sistema sobe pela primeira vez com esta mudança
- **THEN** os sete temas estão cadastrados, com rótulo e palavras-gatilho

#### Scenario: Palavras-gatilho são editáveis
- **WHEN** o operador acrescenta uma expressão às palavras-gatilho de um tema
- **THEN** a classificação passa a reconhecer aquela expressão, sem deploy

#### Scenario: Tema da técnica vem da lista
- **WHEN** uma técnica é gravada com tema que não está na lista
- **THEN** a gravação é recusada e nada é escrito

#### Scenario: Chave duplicada é recusada
- **WHEN** o operador tenta criar tema com chave já existente
- **THEN** a criação é recusada com mensagem legível

### Requirement: Sobrecarga e crise ficam fora da taxonomia

A taxonomia SHALL NOT conter tema de sobrecarga, crise ou desregulação.

Momento de crise SHALL continuar sendo tratado exclusivamente pela regra de
persona que manda reduzir a exigência, e SHALL NOT receber sugestão de técnica.

Motivo registrado: oferecer método a quem está sobrecarregado trabalha contra a
própria regra, que manda pedir menos, não mais. Acrescentar o tema depois é uma
linha na tabela; desfazer o dano de sugerir método a quem está em crise, não.

#### Scenario: Nenhuma técnica é oferecida em crise
- **WHEN** o texto do participante indica sobrecarga
- **THEN** nenhum tema é identificado por sobrecarga e nenhuma técnica é injetada

### Requirement: Ciclo de vida da técnica

Toda técnica SHALL ter título, texto, tema da taxonomia, fonte e status.

Status SHALL ser `rascunho`, `publicada` ou `arquivada`.

Técnica SHALL nascer em `rascunho`, e SHALL NOT ser oferecida em conversa
enquanto não for `publicada`.

A publicação SHALL registrar quem aprovou e quando.

`fonte` SHALL ser obrigatória e de preenchimento livre.

Técnica publicada SHALL NOT ser apagada: sair de circulação SHALL ser feito
mudando o status para `arquivada`.

Motivo registrado: o histórico aponta para a técnica, e apagar a linha
transformaria registro de auditoria em referência morta.

#### Scenario: Rascunho não circula
- **WHEN** existe técnica em rascunho no tema identificado
- **THEN** ela não é injetada no contexto

#### Scenario: Publicação registra autoria
- **WHEN** um administrador publica uma técnica
- **THEN** ficam gravados o administrador e o instante da aprovação

#### Scenario: Arquivar em vez de apagar
- **WHEN** um administrador tira uma técnica publicada de circulação
- **THEN** ela passa a `arquivada` e continua existindo, e deixa de ser injetada

### Requirement: Classificação de tema é determinística

A identificação de tema SHALL ser feita por comparação de palavras-chave sobre o
texto normalizado, e SHALL NOT usar chamada de modelo de linguagem.

A normalização SHALL ser a mesma usada no resto do projeto: sem acento,
minúsculo, espaço colapsado.

A comparação SHALL ser por ocorrência da expressão dentro do texto normalizado.

Mais de um tema casando SHALL ser resolvido pelo maior número de expressões
casadas, e o empate remanescente pela ordem da taxonomia.

Nenhum tema casando SHALL resultar em nenhuma técnica, sem erro.

A função de classificação SHALL ser pura: SHALL NOT importar banco e SHALL
receber a taxonomia por parâmetro.

Motivo registrado: uma chamada de modelo por mensagem só para rotular a
mensagem seria custo recorrente sem retorno de produto. Esta é a mesma escolha
já feita para a classificação de resposta a gatilho.

#### Scenario: Tema identificado por expressão
- **WHEN** o participante escreve algo que contém expressão de um tema
- **THEN** aquele tema é identificado

#### Scenario: Acento e caixa não impedem o casamento
- **WHEN** o texto usa acentuação ou letras maiúsculas
- **THEN** o casamento acontece do mesmo jeito

#### Scenario: Dois temas casam
- **WHEN** o texto casa expressões de dois temas
- **THEN** vence o tema com mais expressões casadas

#### Scenario: Nada casa
- **WHEN** o texto não casa nenhuma expressão
- **THEN** nenhum tema é identificado e a conversa segue sem técnica

### Requirement: No máximo uma técnica por resposta

O sistema SHALL injetar no contexto no máximo UMA técnica por mensagem.

O contexto SHALL NOT receber lista de técnicas.

Motivo registrado: duas viram cardápio, e cardápio é o oposto da regra de ouro
do input mínimo — quem não consegue começar uma tarefa não vai escolher entre
três métodos de começar.

#### Scenario: Várias publicadas, uma injetada
- **WHEN** o tema identificado tem cinco técnicas publicadas
- **THEN** exatamente uma entra no contexto

### Requirement: Rodízio pela menos sugerida recentemente

Entre as técnicas publicadas do tema, o sistema SHALL escolher a de sugestão
mais antiga.

Técnica nunca sugerida SHALL ter precedência sobre qualquer já sugerida.

O empate remanescente SHALL ser resolvido de forma determinística pelo
identificador da técnica.

A escolha SHALL registrar o instante da sugestão na própria técnica.

Motivo registrado: com poucas técnicas por tema, escolha aleatória repete — e
ouvir a mesma frase três dias seguidos é o que faz o produto soar automático,
que é o defeito que esta base existe para corrigir.

#### Scenario: A nunca sugerida vem primeiro
- **WHEN** o tema tem uma técnica já sugerida ontem e outra nunca sugerida
- **THEN** sai a nunca sugerida

#### Scenario: A mais antiga vem antes
- **WHEN** todas as técnicas do tema já foram sugeridas
- **THEN** sai a de sugestão mais antiga

#### Scenario: Duas sugestões seguidas não repetem
- **WHEN** o mesmo tema é identificado duas vezes seguidas e há duas publicadas
- **THEN** a segunda mensagem recebe a outra técnica

### Requirement: A técnica é sugestão, nunca prescrição

O texto injetado no contexto SHALL apresentar a técnica como opção disponível,
e SHALL NOT instruir o modelo a entregá-la.

O modelo SHALL permanecer livre para ignorar a técnica quando ela não couber na
conversa.

A técnica SHALL NOT alterar a verificação de segurança que examina a saída antes
do envio: resposta com instrução de medicação SHALL continuar bloqueada, tenha
ou não havido técnica injetada.

#### Scenario: A técnica não escapa da verificação
- **WHEN** a resposta gerada com técnica injetada contém instrução de medicação
- **THEN** ela é bloqueada exatamente como seria sem técnica

### Requirement: A base não gera conteúdo, apenas o distribui

O sistema SHALL NOT criar, redigir ou completar técnica por chamada de modelo de
linguagem.

Toda técnica SHALL ter origem em curadoria humana registrada em `fonte`.

O conteúdo das técnicas SHALL ser prático e organizacional, e SHALL NOT ser
psicoeducativo ou clínico sobre TDAH, autismo ou qualquer diagnóstico.

A entrega desta mudança SHALL incluir no máximo duas técnicas de exemplo por
tema, em `rascunho`, e SHALL NOT publicar nenhuma.

Motivo registrado: é o mesmo princípio da Regra 1b. Conteúdo que a pessoa vai
ler como orientação não pode ser gerado por quem não responde por ele.

#### Scenario: Nenhuma técnica publicada na entrega
- **WHEN** o sistema sobe pela primeira vez com esta mudança
- **THEN** nenhuma técnica está publicada e a conversa se comporta como antes

### Requirement: Curadoria pela tela do admin

O admin SHALL oferecer tela para listar, criar, editar, publicar e arquivar
técnicas, agrupadas por tema, e para criar e editar os próprios temas.

A tela SHALL exigir sessão autenticada.

Publicar e arquivar SHALL usar confirmação em duas etapas, com página
intermediária em GET que descreve o efeito e não altera nada.

A tela SHALL exibir aviso não bloqueante quando o texto contiver termo de
aparência clínica, e SHALL permitir salvar mesmo assim.

Toda escrita SHALL ser auditada nomeando o autor.

Motivo registrado para o aviso não bloqueante: bloquear por lista de palavras
daria falsa garantia — "respiração" é sensorial e prático, "técnica de
respiração para ansiedade" não é, e nenhuma lista separa os dois.

#### Scenario: Publicação confirmada em duas etapas
- **WHEN** um administrador pede para publicar uma técnica
- **THEN** vê antes uma página que descreve o efeito, e nada muda até confirmar

#### Scenario: Aviso não bloqueia
- **WHEN** o texto da técnica contém termo de aparência clínica
- **THEN** o administrador vê o aviso e ainda assim consegue salvar

#### Scenario: Sem sessão não há acesso
- **WHEN** alguém sem sessão acessa a tela de técnicas
- **THEN** é redirecionado ao login

### Requirement: Sem busca semântica

O sistema SHALL NOT usar embeddings, banco vetorial ou serviço externo de busca
para escolher a técnica.

A escolha SHALL acontecer inteiramente em SQLite local.

Motivo registrado: na escala do piloto, palavra-chave sobre sete temas resolve.
Embedding acrescentaria dependência, custo por mensagem e uma escolha que
ninguém consegue explicar ao ler o código.

#### Scenario: Nenhuma chamada externa na escolha
- **WHEN** uma técnica é escolhida para uma mensagem
- **THEN** nenhuma requisição de rede acontece por causa da escolha
