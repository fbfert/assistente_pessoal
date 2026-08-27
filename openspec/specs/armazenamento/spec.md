# armazenamento Specification

## Purpose

Guardar o estado do piloto — usuários, anamnese, remédios, gatilhos, contadores e o log de
interações — em SQLite estruturado, com nomes de coluna estáveis dos quais os outros módulos
dependem.

## Requirements

### Requirement: SQLite estruturado como armazenamento

O sistema SHALL persistir em SQLite, com WAL habilitado e `foreign_keys=on`, abrindo a conexão
como singleton e executando o schema na primeira abertura.

O sistema SHALL NOT usar banco vetorial.

Motivo registrado: na escala de 5 pessoas o banco vetorial não muda a segurança e adiciona
complexidade sem retorno.

#### Scenario: Primeira abertura cria o schema
- **WHEN** o banco é aberto e o arquivo ainda não existe
- **THEN** o schema é criado e a conexão volta com WAL e chaves estrangeiras ativas

### Requirement: Nomes de coluna são contrato

Os nomes de coluna definidos no schema SHALL ser tratados como contrato entre módulos.
Renomear coluna SHALL ser tratado como mudança de spec, não como refatoração.

As tabelas SHALL ser: `usuarios`, `remedios`, `gatilhos_configurados`, `contadores`,
`despejos_semana`, `historico_interacoes`, `estado_conexao` e `sessoes_web`.

`usuarios` SHALL restringir `personalidade` aos valores `direto`, `caloroso` e `neutro`,
e manter um campo por resposta de anamnese, além dos campos de controle (última
mensagem, lembrete enviado, exemplo já pedido).

`usuarios` SHALL manter os campos `rotina_boa` e `rotina_ruim` existindo separadamente,
mesmo que no MVP a resposta inteira do estado 3 caia apenas em `rotina_boa`.

`usuarios` SHALL ter a coluna `pausado`, inteira, não nula, com padrão 0.

`usuarios` SHALL ter a coluna `data_nascimento`, textual e **anulável**, usada como
segundo fator da entrada pelo canal web.

`gatilhos_configurados` SHALL restringir `tipo` a `checkin_manha`, `remedio` e
`checklist_fim_dia`, e SHALL referenciar um remédio apenas quando `tipo` for `remedio`.

`contadores` SHALL usar `usuario_id` mais `gatilho_tipo` como chave primária composta.

Motivo registrado para a anulabilidade: participantes cadastrados antes desta coluna
não têm o dado, e inventá-lo seria dado falso. Quem não tem data registrada não entra
pela web até o operador preencher — o que é recusa de acesso, não perda de dado.

#### Scenario: Personalidade inválida é rejeitada
- **WHEN** uma escrita tenta gravar personalidade fora dos três valores permitidos
- **THEN** o banco rejeita a escrita

#### Scenario: Usuário novo nasce não pausado
- **WHEN** um usuário é criado
- **THEN** `pausado` vale 0

#### Scenario: Participante antigo sem data de nascimento
- **WHEN** um participante cadastrado antes desta coluna é lido
- **THEN** `data_nascimento` vem vazia, sem valor inventado

### Requirement: Histórico append-only

`historico_interacoes` SHALL restringir `tipo` a `gatilho_disparado`,
`resposta_gatilho`, `despejo_espontaneo`, `silencio`, `correcao_reportada`, `anamnese`,
`acao_admin`, `entrada_web`, `mensagem_enviada`, `resposta_bloqueada_seguranca` e `aprendizado_perfil`.

A ampliação dessa lista em banco já existente SHALL ser feita por migração que recria a
tabela com a constraint atualizada, dentro de transação e com as chaves estrangeiras
desligadas, conferindo a contagem de linhas antes e depois, e SHALL ser idempotente.

`entrada_web` SHALL registrar acesso da própria pessoa, e SHALL NOT ser confundido com
`acao_admin`, que registra escrita do operador sobre ela.

`mensagem_enviada` SHALL registrar toda mensagem que o sistema envia numa conversa —
pergunta de anamnese e resposta de chat livre —, com o canal por onde saiu. Disparo de
gatilho SHALL continuar sendo registrado apenas como `gatilho_disparado`.

`aprendizado_perfil` SHALL registrar o que o sistema aprendeu sobre o participante fora
da anamnese, e SHALL NOT ser confundido com `acao_admin`: um é evento do bot, o outro é
escrita do operador.

`resposta_bloqueada_seguranca` SHALL registrar resposta que o sistema recusou enviar,
guardando o texto que teria sido entregue. Esse texto SHALL NOT ser descartado: sem ele
não há como responder quantas vezes o modelo tentou.

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

#### Scenario: Resposta recusada fica registrada com o texto
- **WHEN** o sistema bloqueia uma resposta por segurança
- **THEN** uma linha `resposta_bloqueada_seguranca` guarda o texto que seria enviado

#### Scenario: Aprendizado de perfil é um tipo válido
- **WHEN** o sistema registra que aprendeu algo novo sobre um participante
- **THEN** o banco aceita o tipo `aprendizado_perfil`

### Requirement: Criação idempotente de usuário

A busca-ou-criação de usuário por número de WhatsApp SHALL ser idempotente: chamadas repetidas
com o mesmo número SHALL retornar o mesmo usuário, sem duplicar linha.

O número de WhatsApp SHALL ser único.

#### Scenario: Convite repetido não duplica
- **WHEN** a busca-ou-criação é chamada duas vezes com o mesmo número
- **THEN** o mesmo `usuario_id` é retornado nas duas chamadas

### Requirement: Contador semanal de despejo

O contador de despejo espontâneo SHALL ser mantido por usuário e por semana, e SHALL zerar na
virada de semana, contando a semana a partir de segunda-feira.

#### Scenario: Virada de semana zera a contagem
- **WHEN** um despejo é registrado e a semana corrente é diferente da armazenada
- **THEN** a contagem reinicia em 1 e o início da semana é atualizado

### Requirement: Contadores de silêncio

O sistema SHALL manter, por usuário e por tipo de gatilho, um contador de silêncios
consecutivos, com operações de leitura, incremento e zeragem, gravando por upsert.

#### Scenario: Resposta zera o contador
- **WHEN** o usuário responde a um gatilho de um tipo cujo contador estava em 2
- **THEN** o contador daquele tipo volta a 0

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

### Requirement: Espera por escrita concorrente

A abertura da conexão com o banco SHALL configurar um tempo de espera para bloqueio.

Motivo registrado: com o admin escrevendo, passam a existir dois processos escritores
sobre o mesmo arquivo SQLite. O WAL suporta o caso, mas sem tempo de espera uma
colisão vira erro imediato em vez de uma pausa de milissegundos.

#### Scenario: Escrita concorrente não falha de imediato
- **WHEN** admin e bot tentam escrever ao mesmo tempo
- **THEN** a segunda escrita aguarda o tempo configurado em vez de falhar na hora

### Requirement: Contas de administrador

O sistema SHALL manter a tabela `admin_usuarios` com identificador, nome,
`email` único, `senha_hash`, `ativo`, `precisa_trocar_senha`, `criado_em` e
`ultimo_login_em`.

Conta inativa SHALL NOT autenticar.

Contas SHALL ser desativadas em vez de removidas, para que a auditoria continue
podendo nomear o autor de ações passadas.

#### Scenario: E-mail duplicado é rejeitado
- **WHEN** uma escrita tenta criar duas contas com o mesmo e-mail
- **THEN** o banco rejeita a segunda

#### Scenario: Conta inativa não entra
- **WHEN** uma conta desativada tenta autenticar com a senha correta
- **THEN** a autenticação é recusada

### Requirement: Log de auditoria da equipe

O sistema SHALL manter a tabela `auditoria_admin`, append-only, com autor, conta
alvo, ação, descrição e momento.

A lista de ações SHALL incluir a configuração de credencial de provedor de LLM.

Ações sobre participantes SHALL continuar em `historico_interacoes`, e SHALL NOT
migrar para este log.

Alterar a lista fechada de ações SHALL ser feito por script de migração idempotente
quando o banco já contiver dados, e SHALL NOT ser feito por recriação do volume.

Motivo registrado: `historico_interacoes.usuario_id` é obrigatório e referencia um
participante; configurar uma credencial não tem participante associado. Quanto à
migração — o banco passou a conter a conta de administrador com a senha definida
pelo operador, e recriar o volume faria o bootstrap restaurá-la a partir do
ambiente, desfazendo a troca em silêncio.

#### Scenario: Ação de equipe não polui a linha do tempo do participante
- **WHEN** uma conta de administrador é criada
- **THEN** nenhuma linha é acrescentada a `historico_interacoes`

#### Scenario: Autor preservado após desativação
- **WHEN** a conta que executou uma ação é depois desativada
- **THEN** o registro de auditoria continua identificando o autor

#### Scenario: Configuração de credencial é registrável
- **WHEN** a credencial de um provedor é configurada
- **THEN** o banco aceita o registro dessa ação

#### Scenario: Migração idempotente
- **WHEN** o script de migração roda num banco que já tem a ação disponível
- **THEN** nada é alterado

### Requirement: Sessões do canal web em tabela própria

O sistema SHALL manter a tabela `sessoes_web` com: o hash do token, o participante, o
momento de criação e o momento de expiração.

A referência ao participante SHALL ter exclusão em cascata, como as demais tabelas
filhas de `usuarios`.

A tabela SHALL NOT guardar o token em forma utilizável.

Linhas expiradas SHALL ser removidas, e essa remoção SHALL NOT ser tratada como perda
de rastro de auditoria.

Motivo registrado: é a única tabela do projeto de onde apagar é o comportamento
correto. Credencial vencida não prova nada e, mantida, só aumenta o que vaza junto num
backup. O rastro de que a pessoa entrou fica em `historico_interacoes`, que ninguém
apaga.

#### Scenario: Token não recuperável
- **WHEN** a tabela de sessões é lida diretamente
- **THEN** nenhum token utilizável é obtido

#### Scenario: Cascata a partir do participante
- **WHEN** um participante é removido do banco
- **THEN** suas sessões desaparecem junto

### Requirement: Colunas novas entram por migração, não por recriação

Acrescentar coluna a tabela já existente SHALL ser feito por script de migração
idempotente, verificando antes se a coluna já existe.

O sistema SHALL NOT exigir recriação do volume para acrescentar coluna.

Motivo registrado: `CREATE TABLE IF NOT EXISTS` não altera tabela existente, e recriar
o volume deixou de ser possível assim que o WhatsApp for pareado — a sessão vive no
mesmo volume. Diferente de alterar um CHECK, acrescentar coluna o SQLite faz com
`ALTER TABLE ... ADD COLUMN`, sem recriar a tabela.

#### Scenario: Banco existente ganha as colunas
- **WHEN** o sistema sobe sobre um banco criado antes destas colunas
- **THEN** as colunas passam a existir, com os dados anteriores preservados

#### Scenario: Migração já aplicada não roda de novo
- **WHEN** o sistema sobe com as colunas já presentes
- **THEN** nenhuma alteração de schema é executada

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

### Requirement: Configuração e conteúdo versionados

O sistema SHALL manter `config_global` (chave única, valor, tipo, quem alterou,
quando) e `prompts_versionados` (chave única, conteúdo, quem alterou, quando).

O sistema SHALL manter uma tabela de histórico para cada uma, com chave, valor
anterior, autor e momento, ambas append-only.

Valor curto e tipado SHALL viver em `config_global`; texto longo, em
`prompts_versionados`.

Motivo registrado: os dois formatos exigem validações incompatíveis — faixa
numérica e formato de horário de um lado, presença e tamanho do outro. Uma tabela
única precisaria de uma coluna `tipo` significando coisas que não se comparam. Os
históricos ficam separados porque uma tabela única exigiria um discriminador de
origem, e duas chaves homônimas de origens diferentes se confundiriam — dois
formatos idênticos custam menos que um com discriminador.

#### Scenario: Chave duplicada é rejeitada
- **WHEN** uma escrita tenta criar duas entradas com a mesma chave na mesma tabela
- **THEN** o banco rejeita a segunda

#### Scenario: Histórico não é sobrescrito
- **WHEN** a mesma chave é alterada várias vezes
- **THEN** cada alteração acrescenta uma linha, sem substituir as anteriores
