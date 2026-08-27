## Context

O defeito foi reproduzido antes de qualquer alteração, e o teste está no repositório.
Com `Vortex` cadastrado e o modelo devolvendo "Comece pelo Vortex agora, se ainda não
tomou hoje", o texto chegou íntegro à pessoa e o histórico registrou uma
`mensagem_enviada` comum — nada indicava problema.

O que já existe e delimita o desenho:

- `NUCLEO_FIXO` tem 8 regras, e a 1b cobre **inventar** dado de saúde. Nenhuma cobre
  **instruir** sobre ele.
- A Regra 3 manda focar na "ação mínima seguinte". Combinada com o contexto da
  anamnese, que lista os remédios da pessoa, ela aponta o modelo exatamente para o
  comportamento perigoso.
- `montarSystemPrompt` já recebe a lista de remédios — o núcleo já sabe quais são.
- `src/db/migracoes.js` já implementa a recriação de tabela para ampliar CHECK.

## Goals / Non-Goals

**Goals:**

- O assistente nunca instruir sobre medicação, nem quando perguntado.
- A proteção não depender só do modelo obedecer.
- Existir rastro de cada tentativa bloqueada.
- Valer igual nos dois canais, sem duplicação.

**Non-Goals:**

- Corrigir conversas passadas.
- Bloquear menção a medicamento que a pessoa não tem cadastrado — a varredura é sobre
  os nomes dela.
- Impedir a pessoa de falar de remédio. A restrição é sobre o que o **assistente** diz.
- Substituir o lembrete automático, que é do agendador e continua existindo.

## Decisions

### Duas camadas, porque uma não basta

**O prompt é a primeira camada, e ele falha.** Modelo de linguagem não obedece regra
100% das vezes — muda de versão, muda de provedor, e uma instrução em português no meio
de outras oito compete com o resto do contexto. Apostar a segurança de dado de saúde
regulado só nisso seria construir a proteção no lugar mais frágil disponível.

**A segunda camada é determinística e não opina:** varredura de texto antes do envio.
Não usa LLM para julgar se a resposta é segura — usar modelo para vigiar modelo herda a
mesma falha.

A varredura combina duas coisas, e exige as duas juntas:

1. um **nome de remédio cadastrado daquela pessoa** (não uma lista genérica de
   medicamentos: o alvo é o remédio real dela, que é o que o modelo vê no contexto);
2. um **verbo de instrução** perto dele — tome, tomar, comece, pode tomar, hora do,
   não esqueça do, aumente, atrase, pule, e as variações razoáveis.

Exigir as duas é o que evita bloquear "vejo que o Vortex está no teu cadastro sem
horário" enquanto pega "comece pelo Vortex agora".

### A assimetria é intencional: bloquear demais é melhor que bloquear de menos

Um falso positivo custa uma resposta boa perdida e uma mensagem genérica no lugar. Um
falso negativo custa uma instrução de medicação entregue a alguém que pode tomar dose
dupla por causa dela.

Não são erros comparáveis, então o desenho não os trata como comparáveis. Quando
houver dúvida, bloqueia.

### O texto bloqueado é guardado, não descartado

Tipo novo `resposta_bloqueada_seguranca`, com **o texto que seria enviado**. Sem ele
não há como responder "quantas vezes isso aconteceu?" — e essa pergunta vai ser feita.

É o mesmo raciocínio que motivou `mensagem_enviada`: o que não é gravado não existe
para quem for auditar depois.

Guardar a resposta perigosa no histórico é guardar conteúdo que nunca deveria alcançar
a pessoa. Isso é aceito: ela fica atrás do login do admin, junto do resto do dado de
saúde dela, e a anonimização já redige o campo `texto` de todas as interações.

### Fica no núcleo, não nos adaptadores

`conversaLivre` é o único ponto por onde passa toda resposta de chat livre dos dois
canais. Duplicar em `whatsapp/handler.js` e em `web/servidor.js` criaria duas cópias
que divergem na primeira correção — exatamente o que a extração do núcleo existe para
impedir.

A anamnese não passa pela varredura: lá o texto enviado é constante do código, não
saída de modelo.

### Migração de CHECK, de novo

O valor novo em `historico_interacoes.tipo` exige o procedimento completo já
implementado em `src/db/migracoes.js`: dentro de transação e com `PRAGMA
foreign_keys = OFF` aplicado **fora** dela, cria-se a tabela com a constraint
atualizada, copiam-se os dados, dropa-se a antiga, renomeia-se, recria-se o índice, e
conferem-se as contagens antes e depois. Idempotente por inspeção de `sqlite_master`,
com o sentinela apontando para o valor mais novo.

## Risks / Trade-offs

**Falso positivo silencioso para a pessoa.** Ela recebe a mensagem genérica sem saber
que outra resposta existia. O operador vê no histórico; ela não. Alternativa
considerada e recusada: explicar que a resposta foi bloqueada — informação que não
ajuda quem está em sobrecarga e que convida a insistir.

**A lista de verbos vai estar incompleta.** Paráfrase criativa passa. A varredura reduz
a superfície, não a fecha — e é por isso que a regra no prompt continua sendo a
primeira camada, não a única.

**Só protege quem tem remédio cadastrado.** Quem não cadastrou nada não é coberto pela
varredura; para essa pessoa, só o prompt vale. Ampliar para uma lista genérica de
medicamentos foi considerado e ficou fora: seria uma lista enorme, desatualizada, e com
falso positivo em palavra comum.
