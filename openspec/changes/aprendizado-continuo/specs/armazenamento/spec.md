## ADDED Requirements

### Requirement: Notas de perfil aprendidas fora da anamnese

O sistema SHALL manter uma tabela `notas_aprendidas` com: o participante, o campo, o
texto da nota, a referência à interação de origem, o momento de criação, e o par de
colunas que registra a remoção — momento e autor.

A coluna `campo` SHALL ter CHECK fechado com os campos elegíveis.

A referência ao participante SHALL ter exclusão em cascata, como as demais tabelas
filhas de `usuarios`. A referência ao autor da remoção SHALL NOT ter cascata — conta de
administrador se desativa, nunca se apaga.

A tabela SHALL ter índice composto em participante mais campo.

Remoção SHALL ser sempre lógica: o sistema SHALL NOT apagar linha de nota, exceto pelo
reinício de anamnese descrito abaixo.

#### Scenario: Campo inválido rejeitado pelo banco
- **WHEN** uma escrita tenta gravar nota com campo fora da lista elegível
- **THEN** o banco rejeita a linha

#### Scenario: Nota removida continua existindo
- **WHEN** uma nota é removida pelo operador
- **THEN** a linha permanece na tabela, com momento e autor da remoção preenchidos

### Requirement: Reinício de anamnese leva as notas junto

O reinício de anamnese SHALL apagar as notas aprendidas daquele participante.

O reinício SHALL NOT tocar em `historico_interacoes`.

Motivo registrado: reiniciar existe para a pessoa responder tudo de novo. Notas
construídas sobre o perfil velho contaminariam o novo — é o mesmo motivo pelo qual
remédios e gatilhos já são apagados ali. O rastro de que as notas existiram continua
nas linhas do histórico, que ninguém apaga.

#### Scenario: Reinício limpa as notas
- **WHEN** a anamnese de um participante é reiniciada
- **THEN** ele não tem mais nota aprendida, e as linhas de histórico correspondentes
  continuam lá

## MODIFIED Requirements

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese`,
`acao_admin`, `entrada_web` e `aprendizado_perfil`.

A ampliação dessa lista em banco já existente SHALL ser feita por migração que recria a
tabela com a constraint atualizada, dentro de transação e com as chaves estrangeiras
desligadas, conferindo a contagem de linhas antes e depois, e SHALL ser idempotente.

`entrada_web` SHALL registrar acesso da própria pessoa, e SHALL NOT ser confundido com
`acao_admin`, que registra escrita do operador sobre ela.

`aprendizado_perfil` SHALL registrar o que o sistema aprendeu sobre o participante fora da
anamnese, e SHALL NOT ser confundido com `acao_admin`: um é evento do bot, o outro é escrita
do operador.

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

#### Scenario: Aprendizado de perfil é um tipo válido
- **WHEN** o sistema registra que aprendeu algo novo sobre um participante
- **THEN** o banco aceita o tipo `aprendizado_perfil`

### Requirement: Anonimização de participante

O sistema SHALL oferecer a anonimização de participante como forma de saída do piloto,
e SHALL NOT oferecer exclusão física do registro.

A anonimização SHALL substituir por marcador redigido: o número de WhatsApp, todos os
campos de anamnese, a data de nascimento, o nome e o horário de cada remédio, o campo
`texto` de todas as interações daquele participante, e o texto de todas as notas aprendidas
dele — removidas ou não.

A anonimização SHALL apagar todas as sessões web daquele participante.

A anonimização SHALL preservar, em cada interação, o tipo, o timestamp, o gatilho
relacionado e o canal.

A anonimização SHALL marcar o participante como pausado.

O marcador de redação SHALL ser distinto da constante que indica ausência de
informação.

Motivo registrado: `historico_interacoes` tem exclusão em cascata a partir de
`usuarios`. Apagar o participante levaria junto o registro de consentimento — com
timestamp e versão — e o rastro das ações do operador sobre o dado dele, que é
justamente a prova exigida numa auditoria. O campo `texto` precisa ser redigido porque
guarda respostas escritas pela própria pessoa, frequentemente com nome e detalhes de
saúde. O texto das notas entra pelo mesmo motivo: é conteúdo escrito pela pessoa, recortado
da conversa — redigir tudo menos as notas seria fachada. A data de nascimento entra por ser
identificação direta. As sessões
são apagadas, e não redigidas, porque uma sessão viva depois da saída do piloto seria
acesso a um dado que a pessoa pediu para encerrar.

#### Scenario: Identificação removida, estrutura preservada
- **WHEN** um participante é anonimizado
- **THEN** número, data de nascimento, campos de anamnese, remédios e textos de
  interação ficam redigidos, e as linhas do histórico continuam existindo com tipo,
  timestamp e canal

#### Scenario: Consentimento continua comprovável
- **WHEN** um participante é anonimizado
- **THEN** o registro de que houve consentimento, com timestamp e versão, permanece

#### Scenario: Redação não se confunde com ausência
- **WHEN** um remédio informado é redigido pela anonimização
- **THEN** o valor gravado difere da constante que indica ausência de informação

#### Scenario: Acesso pela web cessa imediatamente
- **WHEN** um participante com sessão web ativa é anonimizado
- **THEN** a sessão deixa de existir e a requisição seguinte é recusada

#### Scenario: Nota já removida também é redigida
- **WHEN** um participante com nota removida é anonimizado
- **THEN** o texto daquela nota também fica redigido

