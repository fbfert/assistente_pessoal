## Why

A primeira sessão real do piloto aconteceu em 26/08, pelo canal web, e durou 25
minutos. Ela expôs quatro coisas que nenhum dos 284 testes pegava — todas da mesma
família: **o sistema dá a entender que fez algo que não fez.**

**Um horário de remédio foi pedido em voz alta e ignorado.** A pessoa escreveu
"Salva que o bup é ao acordar", depois "Considere 23 horas pro bup". Os dois remédios
seguem no banco com `sem informação` no horário, porque a extração só roda no estado 6
da anamnese. Sem horário não existe gatilho de remédio, então **o lembrete que ela
pediu nunca vai tocar** — e ela não tem como saber.

**Não dá para auditar o que o assistente respondeu.** Só a mensagem recebida é
gravada. As 11 respostas do modelo naquela conversa não existem em lugar nenhum. Num
piloto que existe para validar a qualidade da conversa, falta exatamente a metade que
importa: não dá para checar se o bot confirmou o horário que não salvou.

**Uma pergunta virou perfil.** Na pergunta de pessoas-chave a pessoa respondeu "Como
assim?". O sistema gravou a dúvida como resposta e seguiu. Hoje
`pessoas_chave = "Como assim?"` entra no system prompt de toda conversa dela, como se
fosse fato.

**A correção dela não corrigiu nada, e ela não foi avisada disso.** No resumo, ela
escreveu "Pessoas chave eu perguntei como assim". O sistema registrou
`correcao_reportada` — comportamento especificado — e seguiu. O texto do resumo não
deixa claro que a correção é só uma anotação para a equipe.

O que **funcionou** e não muda: a Regra 1b. "Tomo Vortex a noite e Bup de manha" não
virou 20:00 nem 08:00 — virou `sem informação` nos dois. Correto. O problema não é
que o sistema foi honesto; é que ele ficou calado sobre a consequência.

## What Changes

- **Toda mensagem enviada pelo sistema numa conversa é registrada**, com tipo próprio
  e o canal por onde saiu. O histórico do participante passa a ter os dois lados.
- **Remédio dito no chat livre é extraído e gravado** — mas só quando houver horário
  explícito, e o assistente **confirma o que gravou**. Cada gravação é auditada.
- **Pergunta de volta na anamnese é reformulada, não gravada.** Um conjunto fechado de
  frases de dúvida ("como assim", "não entendi") faz o sistema explicar a pergunta
  outra vez, uma vez por estado, pela mecânica de segunda chance que já existe.
- **O resumo passa a dizer a verdade sobre correção**, e o painel destaca as correções
  reportadas com link direto para o participante.

## Capabilities

### Modified Capabilities

- `armazenamento`: tipo `mensagem_enviada` no CHECK do histórico.
- `nucleo-conversa`: registrar o que foi enviado; extrair remédio no chat livre.
- `anamnese`: dúvida reformulada em vez de gravada; resumo honesto sobre a correção.
- `dashboard-piloto`: correções reportadas em destaque, com link.

## Impact

- **Código:** `src/conversa/nucleo.js`, `src/anamnese/{stateMachine,questions,aplicarPlano}.js`,
  `src/db/{migracoes,schema.sql,interactionLog}.js`, `src/constants.js`,
  `src/dashboard/rotas/painel.js`, `test/`.
- **Dependências:** nenhuma.
- **Schema:** um valor novo no CHECK de `historico_interacoes.tipo` — migração de
  constraint, pelo procedimento que `src/db/migracoes.js` já implementa.
- **Custo:** mais uma chamada de LLM por mensagem de chat livre que **mencione
  remédio**. A extração só dispara quando o texto tem indício de medicação, não em
  toda mensagem.
- **Volume de histórico:** cada turno passa a gravar duas linhas em vez de uma, mais
  as perguntas da anamnese. Numa escala de 5 pessoas, irrelevante; é o que torna o
  piloto auditável.
- **Risco assumido:** escrita de dado de saúde a partir de conversa livre, não de
  pergunta dirigida. Ver o design — a mitigação é exigir horário explícito, reusar o
  prompt estrito da Regra 1b, confirmar em voz alta e auditar.
- **Fora de escopo:** aplicar automaticamente a correção do resumo (o modelo não
  reescreve campo de perfil — decisão mantida), e reperguntar campo já respondido.
