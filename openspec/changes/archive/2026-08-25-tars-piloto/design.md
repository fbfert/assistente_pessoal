## Context

Repositório vazio. Node 22.23.1, npm 10.9.8, Docker 29.7.2 e toolchain de compilação
(`gcc`/`g++`/`make`/`python3`) já disponíveis no servidor.

Restrições que moldam tudo:

- **5 usuários.** Não 5 mil. Toda decisão de escala aqui é deliberadamente pequena, e várias
  seriam erradas em produção.
- **Público de zero disciplina.** Qualquer fricção que exija esforço do usuário para o sistema
  funcionar é um defeito de design, não do usuário.
- **Dado de saúde.** O banco guarda nome de remédio, horário e um registro de consentimento.
- **Raiz do repositório é o home da conta de hospedagem** (`/home/tdah`), decisão explícita do
  dono do projeto. Convive com `Maildir/`, `public_html/`, `logs/`.

## Goals / Non-Goals

**Goals:**

- Validar, com 5 pessoas reais, se um assistente de WhatsApp com tom ajustável e tolerância ao
  silêncio sustenta engajamento.
- Nunca produzir dado de saúde que não veio do usuário.
- Manter o custo de operação e o custo cognitivo do operador baixos.
- Deixar o núcleo lógico (máquina de estados, classificação) testável sem rede e sem banco.

**Non-Goals:**

- API oficial do WhatsApp. Fica para depois da validação.
- Multi-tenancy, autenticação de dashboard, painel de administração.
- Banco vetorial, memória semântica, RAG.
- Correção automática de anamnese.
- Mais de três tipos de gatilho.
- Qualquer capacidade terapêutica ou diagnóstica.

## Decisions

**Máquina de estados pura, banco no chamador.** `stateMachine.js` não importa a camada de
dados: recebe o usuário e dependências injetadas e devolve um plano de ação. Alternativa
descartada: máquina de estados que escreve direto no banco — testar exigiria SQLite em toda
asserção, e o teste de regressão do bug de prefixo ficaria caro demais para existir.

**Reconhecimento de resposta por igualdade exata contra `Set` fechado.** Alternativa
descartada: regex de prefixo — já foi implementada e já quebrou. `"pode me chamar de Ana"`,
resposta legítima da pergunta de NOME, casou com `/^(sim|s|ok|pode)\b/` e foi lida como
afirmativo de CONSENTIMENTO. O efeito não foi uma resposta errada isolada: descolou o estado da
conversa, e cada pergunta seguinte passou a gravar no campo errado. Teste dedicado a essa
frase é parte da spec.

**`'sem informação'` como constante exportada de um módulo único.** Alternativa descartada:
repetir o literal onde for preciso. O filtro de ativação de gatilho compara com `!==`; um typo
sem acento não gera erro, gera um gatilho fantasma de remédio inexistente. Constante única
transforma um bug silencioso em um erro de import.

**SQLite estruturado, não banco vetorial.** Para 5 pessoas, o vetorial não melhora segurança
nem qualidade de resposta, e adiciona um serviço a operar.

**Classificação heurística por janela, não por LLM.** Uma chamada de LLM por mensagem recebida
só para rotular a mensagem é custo recorrente sem retorno de produto. A janela de 120 minutos é
um chute — por isso é variável de ambiente, não constante.

**Janela inclusiva no limite.** Exatamente 120 minutos conta como resposta. Decisão arbitrária,
documentada e testada, para que ninguém a redescubra por acidente.

**Silêncio reduz a exigência.** Depois de 3 silêncios consecutivos do mesmo tipo, a mensagem
seguinte fica mais curta. É o inverso do padrão de app de lembrete. Vem da pesquisa sobre crise
neurodivergente: pergunta direta pode piorar sobrecarga. O número 3 também é chute
configurável.

**Check-in matinal binário.** "Modo normal ou modo disfunção" em vez de "como você está?".
Pergunta aberta pela manhã tem custo de resposta alto para o público-alvo.

**Onboarding proativo.** O bot fala primeiro. O caminho reativo existe só como rede de
segurança. Alternativa descartada: esperar a pessoa escrever — obriga duas mensagens antes de
qualquer coisa acontecer e desalinha a contagem de passos com o que a máquina de estados
espera.

**`checklist_fim_dia` nasce com `ativo = 0`.** O terceiro gatilho existe na esteira mas não é
usado no piloto. Ativação é decisão manual.

**Correção de anamnese só registrada, não parseada.** Parsear "na verdade meu remédio é às 9,
não às 8" é uma superfície de erro grande para 5 pessoas. Correção manual no banco é mais
confiável e mais barata nessa escala.

**Rotina em um campo só, mas duas colunas no schema.** O estado 3 pede horário bom e ruim numa
mensagem só e grava tudo em `rotina_boa`. `rotina_ruim` já existe no schema para que separar
depois não exija migração.

**LLM atrás de um roteador.** Claude usa a Messages API da Anthropic (`x-api-key` + header de
versão); OpenAI e DeepSeek compartilham uma implementação no formato `/chat/completions` com
`Bearer`. Trocar de provedor é variável de ambiente.

**Dashboard sem biblioteca de gráfico, só em loopback.** Tabela HTML. Sem autenticação,
portanto sem exposição pública — acesso por túnel SSH.

## Risks / Trade-offs

**Biblioteca não-oficial do WhatsApp.** `@whiskeysockets/baileys` pode quebrar a qualquer
atualização do WhatsApp, e o número pode ser banido. Mitigação: número dedicado em chip físico,
separado do de produção da Xiax; migração para a API oficial depois da validação. Risco aceito
conscientemente.

**Sessão de WhatsApp em volume.** Perder o volume significa parear de novo, presencialmente com
o chip. O volume nomeado é a mitigação; backup do volume não está no escopo do piloto.

**Dado de saúde sem criptografia em repouso.** O SQLite fica em claro no volume. Para 5 pessoas
em servidor próprio, o controle é o acesso ao servidor. Se o piloto virar produto, isso muda.

**Dois números "no chute": 120 minutos e 3 silêncios.** Não há base empírica para nenhum dos
dois. São variáveis de ambiente exatamente porque o piloto é que vai calibrá-los.

**Repositório na raiz do home da hospedagem.** Um `git add -A` descuidado versionaria e-mail e
site público. Mitigação: `.gitignore` explícito para os diretórios da hospedagem, e a regra em
`AGENTS.md` §5 de conferir `git status` antes de qualquer `git add`.

**Chamadas reais de LLM e de WhatsApp não são cobertas por teste.** Exigem chave e número real.
A suíte cobre lógica pura e integração contra SQLite real; o resto só se confirma no primeiro
pareamento.

**Kits Xiax instalados descrevem outra stack.** `.cursor/rules/xiax-cursorrules.mdc` tem
`alwaysApply: true` e fala de Prisma, MariaDB, `companyId` e Next.js — nada disso existe aqui.
Mitigação: `AGENTS.md` §6 mapeia ativo por ativo o que vale e o que não vale.
