## Why

O piloto vai ao ar para calibrar coisas que ninguém sabe de antemão: quanto tempo
é uma "janela de resposta", quantos silêncios antes de encurtar o tom, que
palavras funcionam no check-in da manhã, quanto o núcleo fixo precisa ser
explícito para o modelo obedecer. São exatamente os parâmetros que hoje só se
mudam **editando código e fazendo deploy**.

Isso cria três problemas concretos:

- **O ciclo de calibração é longo demais.** Ajustar a mensagem do check-in exige
  editar `src/triggers/messages.js`, commitar, rebuildar a imagem e reiniciar o
  container. Para um texto de duas linhas.
- **Não há resposta para "foi o produto ou fui eu?"** Quando o comportamento muda
  no meio do piloto, não existe registro de quem alterou o quê e quando. Esse é
  justamente o período em que essa pergunta precisa ter resposta.
- **Calibrar a persona é editar às cegas.** Hoje só se descobre o efeito de mudar
  o núcleo fixo quando um participante real responde — o que significa usar
  gente em sobrecarga como ambiente de teste.

Há ainda um comportamento que falta e que não é configuração: a pessoa manda três
mensagens seguidas e recebe três respostas, em vez de uma que responda às três.
Isso é ruído para quem já está sobrecarregado.

**Itens 1 e 2 do escopo (login por pessoa e CRUD de administradores) não fazem
parte desta mudança**: já foram entregues pelas mudanças arquivadas
`admin-login-por-pessoa` e `admin-contas-crud`. Esta proposta cobre os itens 3 a 7.

## What Changes

- **Config viva**: valores numéricos, horários e escolhas passam a viver no banco,
  editáveis pela interface, com histórico de autor e reversão para qualquer versão
  anterior. A chave de API **não** entra — continua só no ambiente.
- **Conteúdo versionado**: núcleo fixo, variantes de tom, mensagens de gatilho,
  perguntas da anamnese e texto de consentimento passam a ser lidos do banco, com
  o conteúdo de hoje como semente. Restaurar o padrão de fábrica volta a ela.
- **Tela de Gatilhos**: visão de conjunto que não existe hoje — quantos
  participantes têm cada tipo ativo, horário e mensagem padrão editáveis ali, e o
  estado por participante em leitura, com link para a página de detalhe.
- **Tela de IA / Persona**: núcleo, variantes e provedor num lugar só, mais um
  campo de teste que roda o LLM de verdade contra um contexto fictício, sem tocar
  em nenhum participante.
- **Consentimento versionado**: editar o texto **sempre** incrementa a versão.
- **Debounce**: no chat livre, o bot espera alguns segundos após a última mensagem
  antes de responder, agrupando o que chegou. Nunca durante a anamnese.

## Capabilities

### New Capabilities

- `config-viva`: configuração no banco, com ordem de leitura, validação por tipo,
  histórico e reversão.
- `conteudo-versionado`: textos longos do produto no banco, com semente do código,
  restauração de fábrica e confirmação reforçada para o núcleo fixo.
- `tela-gatilhos`: a visão de conjunto dos três gatilhos.
- `tela-ia`: a tela de persona e o teste isolado de mensagem.
- `debounce`: agrupamento de mensagens no chat livre.

### Modified Capabilities

- `armazenamento`: tabelas `config_global`, `config_historico`,
  `prompts_versionados` e `prompts_historico`.
- `persona`: núcleo fixo e variantes passam a vir do banco, sem deixar de ser
  obrigatórios.
- `gatilhos`: os horários padrão passam a vir da configuração viva, sem retroagir
  sobre quem já foi configurado.
- `anamnese`: perguntas e texto de consentimento vêm do banco; a versão do
  consentimento passa a ser derivada do conteúdo.
- `canal-whatsapp`: o chat livre passa pelo debounce; a anamnese não.
- `llm-provider`: o provedor ativo passa a vir da configuração viva.
- `dashboard-piloto`: as duas telas novas entram na navegação.

## Impact

- **Código:** `src/config.js`, `src/constants.js`, `src/db/` (dois repositórios
  novos e o schema), `src/llm/prompts.js`, `src/triggers/messages.js`,
  `src/anamnese/questions.js`, `src/whatsapp/handler.js`, `src/dashboard/rotas/`
  (duas telas novas), `test/`.
- **Dependências:** nenhuma.
- **Schema:** quatro tabelas novas. Nenhuma alteração destrutiva em tabela
  existente.
- **Custo recorrente novo:** o teste de mensagem faz chamada real e paga à API do
  provedor a cada clique. É a primeira funcionalidade do admin com custo por uso.
- **Risco deliberado:** o núcleo fixo — que carrega a Regra 1b e as outras sete
  regras de segurança — passa a ser editável pela interface. Decisão registrada do
  dono do produto; a compensação é confirmação reforçada e reversão fácil, não
  bloqueio técnico.
- **Fora de escopo:** papéis e permissões; chave de API na interface; edição de
  configuração por participante (só global).
