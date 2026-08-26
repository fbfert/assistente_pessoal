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

### Requirement: Modelo por lista curada, com campo livre

O modelo usado em cada provedor SHALL ser oferecido como lista de opções conhecidas,
derivada dos valores padrão que o próprio projeto já usa, e SHALL NOT ser redigitada
na camada de apresentação.

A interface SHALL oferecer, ao lado da lista, um campo de texto livre sempre visível.
Preenchido, o campo livre SHALL prevalecer sobre a opção selecionada.

O sistema SHALL NOT restringir o valor gravado à lista.

Quando o modelo gravado não pertencer à lista, a interface SHALL exibi-lo assim
mesmo como o valor vigente, e SHALL NOT apresentar outro valor como se fosse o
gravado.

Motivo registrado: modelos novos aparecem com frequência e lista fechada envelhece —
mas o erro comum não é o modelo novo, é o nome digitado errado, que só falha na
primeira conversa real, com um participante do outro lado. A lista é atalho para o
caso comum; o campo livre é a fuga. O campo livre é sempre visível, e não revelado
ao escolher "outro", porque o projeto não tem JavaScript de cliente.

#### Scenario: Trocar o modelo pela lista
- **WHEN** o operador escolhe outro modelo na lista de um provedor
- **THEN** a próxima chamada àquele provedor usa o modelo novo

#### Scenario: Campo livre prevalece
- **WHEN** o operador seleciona um modelo na lista e também digita um no campo livre
- **THEN** o valor gravado é o do campo livre

#### Scenario: Modelo fora da lista continua visível
- **WHEN** a tela é aberta com um modelo gravado que não consta da lista
- **THEN** a tela mostra esse modelo como o vigente

### Requirement: Provedor ativo escolhido pela interface

O provedor ativo na conversa SHALL ser escolhido pela interface, num seletor único
compartilhado pelos provedores, e SHALL NOT ser oferecido por seção.

A escolha SHALL ser gravada no mesmo arquivo das credenciais, fora da entrada de
qualquer provedor.

A resolução do provedor ativo SHALL consultar o arquivo antes da variável de
ambiente.

Trocar o provedor ativo SHALL gerar registro de auditoria.

Motivo registrado: escolhe-se o provedor ativo no mesmo lugar e no mesmo momento em
que se dá a chave a ele. A alternativa — o seletor viver na configuração viva —
criaria duas telas editando o mesmo botão em fontes de verdade diferentes, e quem
mudasse na tela errada não veria efeito nenhum, sem ter como entender por quê.

#### Scenario: Troca de provedor ativo sem reinício
- **WHEN** o operador troca o provedor ativo pela tela
- **THEN** a próxima conversa usa o provedor novo, sem reinício de processo

#### Scenario: Ambiente é o degrau seguinte
- **WHEN** o arquivo não define provedor ativo
- **THEN** vale a variável de ambiente

### Requirement: Teste de conectividade por provedor

A interface SHALL oferecer, ao lado da ação de salvar de cada provedor, uma ação de
teste que faz uma chamada real e mínima àquele provedor.

O teste SHALL usar a chave digitada no formulário quando houver uma, e a chave já
gravada quando o campo estiver vazio. A mesma regra SHALL valer para o modelo.

O teste SHALL NOT gravar nada: nem a chave, nem o modelo, nem o provedor ativo.

O resultado SHALL indicar sucesso — com o tempo da chamada — ou falha, sem expor a
chave e sem incluir o corpo bruto da resposta do provedor.

O teste SHALL exigir a mesma sessão autenticada do restante do admin.

O teste SHALL NOT gerar registro de auditoria.

Motivo registrado: o campo de chave é write-only, então sem aceitar o rascunho não
haveria como validar uma credencial **antes** de substituir a atual — que é
exatamente o momento em que o erro custa caro. E não se audita o que não muda nada;
o que se audita é gravação.

#### Scenario: Teste com rascunho
- **WHEN** o operador cola uma chave e aciona o teste sem salvar
- **THEN** a chamada usa a chave colada e nada é gravado

#### Scenario: Teste com a chave já salva
- **WHEN** o operador aciona o teste com o campo de chave vazio
- **THEN** a chamada usa a chave já gravada

#### Scenario: Falha de credencial no teste
- **WHEN** o provedor recusa a credencial testada
- **THEN** a tela informa a falha sem mostrar a chave e sem o corpo da resposta

#### Scenario: Teste não persiste
- **WHEN** um teste é executado com chave e modelo diferentes dos gravados
- **THEN** o arquivo de credenciais permanece inalterado

### Requirement: Modelo de transcrição configurável

O modelo de transcrição de áudio SHALL ser configurável pela interface, na seção do
provedor OpenAI, pela mesma mecânica de lista curada com campo livre.

O valor SHALL ser gravado na entrada do provedor OpenAI, separado do modelo de
conversa.

A resolução do modelo de transcrição SHALL consultar o arquivo antes da variável de
ambiente.

A interface SHALL declarar, junto ao campo, que a transcrição usa a chave da OpenAI
da mesma seção e continua sendo OpenAI independentemente do provedor ativo.

Motivo registrado: a transcrição usa a mesma conta OpenAI desde o primeiro dia —
`config.transcription.apiKey` sempre foi `OPENAI_API_KEY`. O que faltava não era
chave, era onde escolher o modelo. Uma seção própria sugeriria uma credencial
separada, que é exatamente o mal-entendido a evitar.

#### Scenario: Trocar o modelo de transcrição
- **WHEN** o operador altera o modelo de transcrição pela tela
- **THEN** a próxima transcrição usa o modelo novo, sem reinício

#### Scenario: Ambiente é o degrau seguinte
- **WHEN** o arquivo não define modelo de transcrição
- **THEN** vale a variável de ambiente

### Requirement: Auditoria sem o valor

Toda gravação de chave ou de modelo SHALL gerar registro de auditoria indicando
qual provedor foi alterado, o que foi alterado e por quem.

O registro SHALL NOT conter a chave, nem a anterior nem a nova, em nenhuma forma.

#### Scenario: Troca registrada sem a credencial
- **WHEN** a chave de um provedor é trocada
- **THEN** existe registro identificando provedor, ação e autor, e a chave não
  aparece nele

### Requirement: A transcrição não muda de provedor nem de chave

A escolha de provedor de conversa SHALL NOT alterar o provedor usado na transcrição
de áudio, que permanece OpenAI.

A transcrição SHALL usar a mesma chave configurada para o provedor OpenAI, e o
sistema SHALL NOT oferecer chave separada para ela.

Configurar o modelo de transcrição SHALL NOT alterar o modelo de conversa do
provedor OpenAI, e vice-versa.

#### Scenario: Provedor de conversa trocado
- **WHEN** o provedor ativo da conversa muda para `claude`
- **THEN** a transcrição de áudio continua usando OpenAI, com a chave da seção OpenAI

#### Scenario: Dois modelos independentes na mesma seção
- **WHEN** o operador altera o modelo de conversa da OpenAI
- **THEN** o modelo de transcrição permanece como estava
