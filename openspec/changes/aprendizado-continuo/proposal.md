## Why

A anamnese captura o perfil **uma vez**, no dia 1. Depois disso o chat livre só
**lê** esse contexto — nunca escreve de volta nele. A ideia original do produto era
"a cada dia o app vai te conhecendo melhor"; isso não existe no código.

O efeito no piloto é concreto: alguém conta na terça que barulho de obra derruba a
semana inteira, e na quarta o bot não sabe. O sistema para de parecer um amigo
virtual e volta a parecer um formulário que já foi respondido.

Isso não é ajuste de tom — é a diferença entre um assistente que acumula contexto e
um que congelou no primeiro dia. Num piloto de 2 a 3 semanas com 5 pessoas, é
justamente o que se está tentando validar.

## What Changes

- **Notas aprendidas** viram uma tabela própria, `notas_aprendidas`: campo, texto,
  a interação de origem, quando, e o par de colunas de remoção. Empilham **por
  cima** da resposta da anamnese, sem nunca substituí-la.
- **Extração por LLM a cada mensagem de chat livre**, no mesmo padrão já testado em
  `extrairRemedios.js`: prompt estrito, parse defensivo, falha vira "não aprendeu
  nada". Recebe o perfil já conhecido para não reaprender o que já está registrado.
- **Chamada em paralelo com a de resposta**, sem atrasar o reply. Decisão registrada
  no design.
- **`montarContextoAnamnese` passa a incluir as notas ativas**, com rótulo distinto
  da resposta original, por campo.
- **Seção "Aprendizado contínuo" na página do participante**, com remoção por soft
  delete e confirmação em duas etapas.
- **Tipo novo `aprendizado_perfil` em `historico_interacoes`**, com migração do
  CHECK — a primeira deste projeto a rodar sobre banco possivelmente já pareado.

**Fora de escopo, por decisão:** remédio e nome. Remédio já tem extração própria com
tratamento de Regra 1b específico para dado de saúde regulado; nome é identidade, não
traço de perfil. Nenhum dos dois passa por este mecanismo.

## Capabilities

### New Capabilities

- `aprendizado-continuo`: notas de perfil aprendidas fora da anamnese — o que é
  elegível, o critério conservador de captura, e como se removem.

### Modified Capabilities

- `armazenamento`: tabela `notas_aprendidas`, tipo `aprendizado_perfil` no CHECK do
  histórico, e a anonimização passando a redigir o texto das notas.
- `persona`: o contexto do system prompt inclui as notas ativas, rotuladas à parte.
- `canal-whatsapp`: o chat livre dispara a extração em paralelo com a resposta.
- `dashboard-piloto`: a página de detalhe ganha a seção de notas aprendidas.

## Impact

- **Código:** `src/db/schema.sql`, `src/db/migracoes.js` (novo),
  `src/db/notasRepo.js` (novo), `src/db/userRepo.js` (anonimização e reinício),
  `src/constants.js`, `src/anamnese/aprenderPerfil.js` (novo), `src/llm/prompts.js`,
  `src/whatsapp/handler.js`, `src/dashboard/rotas/usuario.js`,
  `src/dashboard/rotas/acoes.js`, `test/`.
- **Dependências:** nenhuma.
- **Schema:** uma tabela nova (entra sozinha, `CREATE TABLE IF NOT EXISTS`) e uma
  migração de CHECK constraint em `historico_interacoes`, que **não** entra sozinha.
- **Custo recorrente novo:** uma chamada de LLM por mensagem de chat livre. Prompt
  curto (mensagem + perfil conhecido), resposta de uma linha de JSON. Na escala do
  piloto — 5 pessoas, 2 a 3 semanas — é da ordem de mil chamadas curtas no período
  inteiro. Dimensionado no README, não deixado implícito.
- **Risco deliberado:** um extrator mais solto que o de remédio grava traço de perfil
  sem revisão humana prévia. A compensação é o critério conservador no prompt, a
  visibilidade no admin e a remoção em um clique — não bloqueio técnico.
- **Relação com as mudanças ativas:** independente de `admin-backend-fase2` e de
  `conexao-llm`; toca arquivos que a Fase 2 também toca. Ver o design.
