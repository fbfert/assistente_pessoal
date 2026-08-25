## Purpose

Permitir configurar a chave de API e o modelo de cada provedor de LLM pela
interface, sem SSH e sem reinício, sem que a credencial volte a ser legível depois
de gravada.

## ADDED Requirements

### Requirement: Credenciais em arquivo no volume compartilhado

As credenciais SHALL ser gravadas em um arquivo dentro do volume compartilhado
pelos dois processos, com uma entrada por provedor contendo chave e modelo.

O arquivo SHALL ser criado com permissão restrita ao usuário do processo.

As credenciais SHALL NOT ser gravadas no banco de dados nem em arquivo de ambiente.

Motivo registrado: o arquivo de ambiente é lido uma única vez, quando o container
sobe — escrever nele de dentro do processo não alcança o outro container e não
sobrevive a um rebuild. O banco, por sua vez, é o que se copia em backup, o que se
inspeciona quando algo dá errado, e o que tem "ver histórico" como funcionalidade;
credencial não pertence a esse ciclo.

#### Scenario: Escrita não alcança o ambiente
- **WHEN** uma chave é configurada pela interface
- **THEN** ela é gravada no arquivo do volume, e nenhuma variável de ambiente é
  alterada

#### Scenario: O outro processo enxerga
- **WHEN** o admin grava uma credencial
- **THEN** o processo do bot passa a resolvê-la, por compartilharem o volume

### Requirement: Escrita atômica

A gravação SHALL ser atômica do ponto de vista de quem lê: um leitor concorrente
SHALL ver o conteúdo anterior completo ou o novo completo, nunca um estado parcial.

Motivo registrado: o admin escreve enquanto o bot pode estar lendo. Escrever
diretamente sobre o arquivo deixa uma janela em que o leitor obtém conteúdo
truncado e a chamada ao provedor falha por um motivo que não tem a ver com a
credencial.

#### Scenario: Leitura durante a escrita
- **WHEN** o bot lê o arquivo no instante em que o admin o grava
- **THEN** obtém um conteúdo íntegro, antigo ou novo

### Requirement: Leitura ao vivo, sem reinício

Cada processo SHALL manter o conteúdo em memória e SHALL verificar o horário de
modificação do arquivo antes de servir o valor, relendo quando tiver mudado.

Uma credencial trocada SHALL passar a valer sem reinício de processo.

Motivo registrado: sem a verificação, trocar a chave pelo admin não alcançaria o
bot até o próximo reinício — e ninguém perceberia, porque o admin mostraria a chave
nova como configurada enquanto o bot seguiria usando a antiga.

#### Scenario: Troca vale de imediato
- **WHEN** a chave de um provedor é substituída pela interface
- **THEN** a próxima chamada ao provedor usa a chave nova, sem reinício

#### Scenario: Arquivo inalterado não é relido
- **WHEN** o arquivo não mudou desde a última leitura
- **THEN** o valor em memória é usado

### Requirement: A chave nunca é devolvida

O repositório de credenciais SHALL expor uma consulta de status que devolve apenas
se o provedor está configurado, os últimos caracteres da chave e o modelo.

O valor completo SHALL ser devolvido apenas à função que executa a chamada ao
provedor.

A interface SHALL NOT receber o valor completo em nenhuma resposta, e o campo de
chave SHALL ser apresentado vazio mesmo quando já houver uma configurada.

#### Scenario: Campo sempre vazio ao carregar
- **WHEN** a tela é aberta com uma chave já configurada
- **THEN** o campo de chave aparece vazio, e o status mostra apenas os últimos
  caracteres

#### Scenario: Nenhuma resposta carrega a chave
- **WHEN** qualquer página do admin é servida
- **THEN** nenhuma chave de API completa aparece no corpo da resposta

### Requirement: Sobrescrever chave configurada exige confirmação

Substituir a chave de um provedor que já tem uma configurada SHALL passar por
confirmação em duas etapas.

Configurar um provedor pela primeira vez SHALL NOT exigir essa confirmação.

Motivo registrado: não há histórico nem reversão de credencial — guardar a chave
anterior significaria manter, num lugar consultável, uma credencial provavelmente
revogada, para nunca usá-la. Sobrescrever é, portanto, irreversível, e é a única
configuração do admin com essa característica.

#### Scenario: Substituição confirmada
- **WHEN** o operador substitui uma chave já configurada
- **THEN** uma etapa de confirmação descreve que a anterior será perdida

#### Scenario: Primeira configuração é direta
- **WHEN** o provedor ainda não tem chave
- **THEN** a gravação ocorre sem etapa extra

### Requirement: Modelo configurável por provedor

O modelo usado em cada provedor SHALL ser configurável pela interface, como texto
livre.

O sistema SHALL NOT restringir o valor a uma lista fechada.

Motivo registrado: modelos novos aparecem com frequência, e lista fechada
envelhece. Um nome inválido falha na primeira chamada, com erro do provedor.

#### Scenario: Trocar o modelo
- **WHEN** o operador altera o modelo de um provedor
- **THEN** a próxima chamada àquele provedor usa o modelo novo

### Requirement: Auditoria sem o valor

Toda gravação de chave ou de modelo SHALL gerar registro de auditoria indicando
qual provedor foi alterado, o que foi alterado e por quem.

O registro SHALL NOT conter a chave, nem a anterior nem a nova, em nenhuma forma.

#### Scenario: Troca registrada sem a credencial
- **WHEN** a chave de um provedor é trocada
- **THEN** existe registro identificando provedor, ação e autor, e a chave não
  aparece nele

### Requirement: A transcrição não é afetada

A escolha de provedor de conversa SHALL NOT alterar o provedor usado na transcrição
de áudio, que permanece o mesmo.

#### Scenario: Provedor de conversa trocado
- **WHEN** o provedor ativo da conversa muda
- **THEN** a transcrição de áudio continua usando o provedor de sempre
