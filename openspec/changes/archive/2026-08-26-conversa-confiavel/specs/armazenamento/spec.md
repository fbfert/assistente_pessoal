## MODIFIED Requirements

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese`,
`acao_admin`, `entrada_web` e `mensagem_enviada`.

A ampliação dessa lista em banco já existente SHALL ser feita por migração que recria a
tabela com a constraint atualizada, dentro de transação e com as chaves estrangeiras
desligadas, conferindo a contagem de linhas antes e depois, e SHALL ser idempotente.

`entrada_web` SHALL registrar acesso da própria pessoa, e SHALL NOT ser confundido com
`acao_admin`, que registra escrita do operador sobre ela.

`mensagem_enviada` SHALL registrar toda mensagem que o sistema envia numa conversa —
pergunta de anamnese e resposta de chat livre —, com o canal por onde saiu. Disparo de
gatilho SHALL continuar sendo registrado apenas como `gatilho_disparado`.

Motivo registrado: sem isso, metade da conversa não existe. Num piloto que existe para
avaliar a qualidade do que o assistente diz, falta exatamente o lado que importa — e
não há como investigar se ele confirmou algo que não fez.

Linhas cujo tipo não representa mensagem — como `acao_admin` — SHALL carregar o valor
padrão de `canal`, e a interface SHALL NOT exibir canal para elas.

`historico_interacoes` SHALL ter a coluna `canal`, restrita a `whatsapp` e `web`, não
nula, com padrão `whatsapp`.

A tabela SHALL ter índice composto em `usuario_id` mais `timestamp`.

Linhas SHALL ser acrescentadas e nunca sobrescritas, com uma única exceção: a
anonimização de participante, que redige o campo `texto` conforme a capacidade de
anonimização abaixo.

Motivo registrado para o padrão: toda linha que já existe veio do WhatsApp, e deixar a
coluna anulável obrigaria cada consulta a tratar o caso do nulo para sempre.

#### Scenario: Interação registrada
- **WHEN** qualquer interação relevante ocorre
- **THEN** uma linha é acrescentada ao histórico com tipo, timestamp, texto e canal, sem
  sobrescrever linha anterior

#### Scenario: Ação de admin é um tipo válido
- **WHEN** uma ação de escrita do operador é registrada
- **THEN** o banco aceita o tipo `acao_admin`

#### Scenario: Linha antiga vale como WhatsApp
- **WHEN** o histórico anterior a esta mudança é lido
- **THEN** todas as linhas aparecem como do canal `whatsapp`

#### Scenario: Canal desconhecido é rejeitado
- **WHEN** uma escrita tenta gravar um canal fora dos valores permitidos
- **THEN** o banco rejeita a escrita

#### Scenario: Entrada pela web é um tipo válido
- **WHEN** uma entrada pelo canal web é registrada
- **THEN** o banco aceita o tipo `entrada_web`

#### Scenario: Migração da lista de tipos preserva o histórico
- **WHEN** a migração roda sobre um banco com interações já gravadas
- **THEN** a contagem de linhas depois é idêntica à de antes, e o índice composto
  continua existindo

#### Scenario: Ação de admin não exibe canal
- **WHEN** a página do participante mostra uma linha de `acao_admin`
- **THEN** nenhum canal é exibido para ela

#### Scenario: A resposta do sistema fica registrada
- **WHEN** o sistema responde a uma mensagem do participante
- **THEN** uma linha `mensagem_enviada` é acrescentada com o texto enviado e o canal

#### Scenario: Envio que falha não vira registro
- **WHEN** o envio de uma resposta falha
- **THEN** nenhuma linha `mensagem_enviada` é gravada para ela
