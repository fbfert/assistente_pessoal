## Why

O assistente pode mandar a pessoa tomar remédio, e hoje nada impede isso de chegar
nela.

Reproduzido antes de qualquer alteração, com o cenário do piloto real — participante
com `Vortex` cadastrado (nome sim, horário não), mensagem neutra no chat livre, e o
modelo respondendo *"Comece pelo Vortex agora, se ainda não tomou hoje."* O texto foi
entregue inteiro. Nenhuma barreira, nenhum registro de que algo fora do lugar
aconteceu.

Isto é diferente de todos os outros defeitos tratados até aqui. **A Regra 1b protege
contra inventar dado de saúde; não existe nada protegendo contra instruir sobre ele.**
E as duas regras que o núcleo já tem empurram nessa direção: a Regra 3 manda focar na
"ação mínima seguinte", e o contexto da anamnese entrega os nomes dos remédios da
pessoa. Tomar o remédio É a ação mínima mais óbvia que o modelo enxerga.

O público torna isso pior: pessoas com TDAH e autismo, muitas em uso de psicotrópico
controlado, conversando com algo que soa confiante e pessoal. Uma instrução de
"comece pelo Vortex agora" pode virar dose dupla — a pessoa já tomou e não lembra, que
é literalmente o problema que a trouxe ao piloto.

## What Changes

- **Regra 1c no núcleo fixo**, logo depois da 1b: o assistente nunca instrui, sugere,
  lembra ou pergunta sobre tomar, ajustar, atrasar ou pular medicamento.
- **A Regra 3 passa a excluir medicação explicitamente** da "ação mínima seguinte". É a
  combinação das duas que produziu o defeito.
- **Rede de segurança determinística no núcleo de conversa**: antes de enviar, a
  resposta é varrida contra os nomes de remédio já cadastrados daquela pessoa mais uma
  lista de verbos de instrução. Batendo, a resposta **não sai**; entra no lugar uma
  mensagem fixa e segura.
- **Tipo novo `resposta_bloqueada_seguranca`** no histórico, guardando o texto que
  seria enviado — sem isso não há como auditar quantas vezes o modelo tentou.
- **Vale nos dois canais**, porque mora no núcleo compartilhado.

## Capabilities

### Modified Capabilities

- `persona`: Regra 1c no núcleo fixo, e a Regra 3 excluindo medicação.
- `nucleo-conversa`: bloqueio determinístico antes do envio.
- `armazenamento`: tipo `resposta_bloqueada_seguranca` no CHECK do histórico.

## Impact

- **Código:** `src/llm/prompts.js`, `src/conversa/nucleo.js`, `src/constants.js`,
  `src/db/{schema.sql,migracoes.js}`, `test/`.
- **Schema:** um valor novo no CHECK — migração de constraint, pelo procedimento que
  `src/db/migracoes.js` já implementa.
- **Comportamento:** o assistente passa a recusar decisão sobre remédio mesmo quando
  perguntado diretamente. É recusa deliberada, não limitação a corrigir depois.
- **Falso positivo aceito:** uma resposta legítima que mencione o nome do remédio perto
  de um verbo de instrução será bloqueada. Ver o design — a assimetria é intencional.
- **Fora de escopo:** corrigir conversas passadas, e bloquear menção a medicamento que
  a pessoa não tem cadastrado.
