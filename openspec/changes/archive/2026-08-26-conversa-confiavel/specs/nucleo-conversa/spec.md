## ADDED Requirements

### Requirement: Toda mensagem enviada é registrada

O núcleo SHALL registrar, no histórico do participante, cada mensagem que enviar —
pergunta de anamnese e resposta de conversa livre —, com o canal por onde saiu.

O registro SHALL acontecer depois do envio bem-sucedido.

Falha no envio SHALL NOT produzir registro de mensagem enviada.

Motivo registrado: registrar antes do envio produziria histórico de mensagem que nunca
chegou. Quando o envio falha, a ausência da linha é a informação correta.

#### Scenario: Os dois lados no histórico
- **WHEN** um participante conversa com o assistente
- **THEN** o histórico contém a mensagem dele e a resposta do sistema, em ordem

#### Scenario: Anamnese também registra o que perguntou
- **WHEN** o sistema faz uma pergunta da anamnese
- **THEN** a pergunta enviada fica registrada

### Requirement: Remédio dito na conversa livre é gravado, com horário e confirmação

Quando o texto de um participante com anamnese concluída tiver indício de medicação, o
sistema SHALL executar a extração de remédio já existente, com o mesmo prompt estrito.

O sistema SHALL gravar apenas item que vier com **horário**; item sem horário SHALL ser
descartado sem alterar nada.

Remédio cujo nome já exista para aquele participante SHALL ter o horário atualizado;
nome novo SHALL criar um remédio. Em ambos os casos o gatilho de remédio correspondente
SHALL ser reconciliado.

O sistema SHALL confirmar ao participante, na resposta, exatamente o que foi gravado.

A confirmação registrada como mensagem enviada SHALL servir de rastro de auditoria da
gravação: ela diz, na linha do tempo da pessoa, exatamente o que o sistema gravou e
quando. O sistema SHALL NOT criar um tipo de interação separado para isso.

A extração SHALL NOT rodar durante a anamnese, onde o estado 6 já faz esse trabalho, e
falha dela SHALL NOT impedir a resposta normal.

Motivo registrado: a pessoa pediu "considere 23 horas pro bup" e nada foi gravado — sem
horário não há gatilho, então o lembrete que ela pediu nunca tocaria, e ela não tinha
como saber. Exigir horário é o que evita que uma menção de passagem vire cadastro; a
confirmação em voz alta é o que dá a ela a chance de dizer "não é meu".

#### Scenario: Horário explícito é gravado e confirmado
- **WHEN** o participante diz o horário de um remédio na conversa livre
- **THEN** o horário é gravado, o gatilho é reconciliado e a resposta diz o que foi gravado

#### Scenario: Menção sem horário não grava nada
- **WHEN** o participante cita um remédio sem dizer horário
- **THEN** nada é gravado e nenhum remédio novo é criado

#### Scenario: Remédio que já existe é atualizado, não duplicado
- **WHEN** o participante informa o horário de um remédio que já está cadastrado
- **THEN** o horário daquele remédio é atualizado, sem criar um segundo

#### Scenario: Falha na extração não afeta a conversa
- **WHEN** a extração falha
- **THEN** a resposta normal é enviada e nada é gravado
