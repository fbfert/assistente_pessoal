# canal-web Specification

## Purpose

Oferecer um segundo canal de conversa, pelo navegador, para quem o WhatsApp não
alcança bem e para que o piloto não dependa de uma única biblioteca não-oficial.

## Requirements

### Requirement: Entrada apenas para quem já foi pré-cadastrado

A entrada SHALL receber telefone e data de nascimento e validá-los contra um
participante já existente.

O sistema SHALL NOT criar participante por esse caminho, em nenhuma circunstância.

A validação SHALL exigir que o participante tenha estado de anamnese registrado,
inclusive quando o estado for 0.

Motivo registrado: sem isso, a rota pública viraria autocadastro, e qualquer pessoa na
internet entraria num sistema que guarda dado de saúde. Quem entra é quem o operador
convidou — o convite continua sendo o único caminho de cadastro.

#### Scenario: Participante convidado entra
- **WHEN** telefone e data de nascimento conferem com um participante existente
- **THEN** a entrada é concedida

#### Scenario: Telefone desconhecido não cria nada
- **WHEN** alguém tenta entrar com um telefone que não está no banco
- **THEN** a entrada é recusada e nenhum participante é criado

#### Scenario: Participante sem data de nascimento cadastrada
- **WHEN** o participante existe mas não tem data de nascimento registrada
- **THEN** a entrada é recusada, e o caminho de correção é o admin

### Requirement: Falha de entrada é sempre indistinguível

A resposta de falha SHALL ser idêntica para telefone inexistente, data incorreta e
participante sem data cadastrada.

O sistema SHALL NOT revelar, por texto, código de status ou tempo de resposta, se um
telefone pertence a alguém do piloto.

Motivo registrado: distinguir os casos transformaria a rota num verificador de quem
participa — e participar deste piloto é, por si só, informação de saúde.

#### Scenario: Mesma resposta para causas diferentes
- **WHEN** duas tentativas falham por motivos diferentes
- **THEN** as duas respostas são iguais

### Requirement: Limite de tentativas por origem e por telefone

O sistema SHALL contar falhas de entrada por origem da requisição **e** por telefone
informado, e SHALL bloquear temporariamente quando qualquer uma das contagens atingir
o limite.

O limite SHALL ser de cinco falhas, e o bloqueio SHALL durar quinze minutos.

Cada falha SHALL custar um atraso fixo na resposta, aplicado depois de contabilizada.

Uma entrada bem-sucedida SHALL zerar as contagens daquele telefone e daquela origem.

Motivo registrado: o par telefone mais data de nascimento é fraco — o telefone não é
segredo e a data tem alguns milhares de valores plausíveis. A contagem por origem
sozinha não basta: o endereço chega por proxy e é forjável no cabeçalho, enquanto o
telefone é o alvo real e não se forja. O atraso fixo, por não depender de identificar
a origem, é a única defesa que não se contorna.

#### Scenario: Bloqueio por telefone
- **WHEN** cinco tentativas falham para o mesmo telefone, de origens diferentes
- **THEN** as tentativas seguintes para aquele telefone são recusadas por quinze
  minutos

#### Scenario: Bloqueio por origem
- **WHEN** cinco tentativas falham da mesma origem, para telefones diferentes
- **THEN** as tentativas seguintes daquela origem são recusadas por quinze minutos

#### Scenario: Sucesso limpa o histórico de falhas
- **WHEN** uma entrada é concedida depois de tentativas malsucedidas
- **THEN** as contagens daquele telefone e daquela origem voltam a zero

### Requirement: Sessão web curta, com o token guardado em hash

A sessão SHALL viver em tabela própria, com o identificador do participante, o momento
de criação e o momento de expiração.

O sistema SHALL guardar apenas o **hash** do token; o valor completo SHALL existir
somente na resposta que o emitiu e no cliente.

Requisição com token ausente, desconhecido ou expirado SHALL ser recusada.

Sessão expirada SHALL ser removida da tabela, e SHALL NOT ser preservada como rastro.

A entrada bem-sucedida SHALL ser registrada no histórico do participante; o token
SHALL NOT aparecer em nenhum registro nem em nenhum log.

Motivo registrado: sessão em memória do processo custaria a conversa de todo mundo a
cada reinício do container — inclusive no meio da anamnese, que é quando a pessoa tem
mais a perder. Guardar o hash em vez do valor é o mesmo princípio da senha do
operador: quem lê o banco não consegue se passar por ninguém. E credencial vencida não
é rastro de auditoria: o que fica registrado é a entrada, não o token.

#### Scenario: Token não recuperável do banco
- **WHEN** alguém lê a tabela de sessões
- **THEN** não encontra nenhum token utilizável

#### Scenario: Sessão expirada é recusada
- **WHEN** uma requisição chega com token expirado
- **THEN** é recusada e a sessão é removida

#### Scenario: Reinício não desloga
- **WHEN** o processo reinicia enquanto uma sessão válida existe
- **THEN** a mesma sessão continua valendo

### Requirement: Envio de mensagem autenticado, com resposta na mesma chamada

O envio SHALL exigir sessão válida e SHALL identificar o participante pela sessão,
nunca por dado enviado pelo cliente.

A mensagem SHALL ser entregue ao núcleo de conversa, e a resposta SHALL voltar na mesma
requisição.

O sistema SHALL NOT aceitar, no corpo da requisição, qualquer campo que altere de qual
participante a mensagem é.

#### Scenario: Identidade vem da sessão
- **WHEN** uma requisição autenticada tenta indicar outro participante no corpo
- **THEN** o campo é ignorado e a mensagem é processada como do dono da sessão

#### Scenario: Resposta imediata
- **WHEN** uma mensagem válida é enviada
- **THEN** a resposta do assistente volta na mesma chamada

### Requirement: Anamnese pela web usa o conteúdo já existente

As perguntas, o texto de consentimento, o pedido de exemplo e o texto de conclusão
SHALL ser os mesmos usados no WhatsApp, lidos da mesma origem.

O sistema SHALL NOT manter cópia desses textos para a web.

O consentimento aceito pela web SHALL ser registrado com a mesma versão e nos mesmos
campos do aceito pelo WhatsApp.

#### Scenario: Texto editado alcança os dois canais
- **WHEN** o texto de uma pergunta muda na origem
- **THEN** os dois canais passam a usar o texto novo

#### Scenario: Consentimento é um só
- **WHEN** um participante aceita o consentimento pela web
- **THEN** o registro é indistinguível de um aceite pelo WhatsApp, exceto pelo canal

### Requirement: O canal web é somente reativo

O canal web SHALL responder apenas a mensagem enviada pela pessoa.

O sistema SHALL NOT enviar, pelo canal web, check-in da manhã, lembrete de remédio,
checklist de fim de dia, cobrança de silêncio ou qualquer mensagem não solicitada.

O agendador SHALL continuar disparando exclusivamente pelo WhatsApp.

O sistema SHALL NOT implementar notificação de navegador.

Motivo registrado: o mecanismo central do produto é chegar antes — e nenhuma entrega
por navegador tem a garantia que um lembrete de remédio precisa ter: depende de
permissão que este público costuma negar, falha em silêncio com a aba fechada e se
comporta de um jeito em cada navegador. A divisão fica explícita: a web é onde a
pessoa procura o assistente; o WhatsApp é onde o assistente procura a pessoa.

#### Scenario: Gatilho não sai pela web
- **WHEN** chega o horário do check-in de um participante que usa a web
- **THEN** a mensagem é enviada pelo WhatsApp, e nada é enviado pelo canal web

#### Scenario: Sem mensagem não solicitada
- **WHEN** um participante mantém a página aberta sem escrever nada
- **THEN** nenhuma mensagem é enviada a ele

### Requirement: Página pública com JavaScript mínimo e delimitado

A página SHALL ser servida pelo próprio sistema, com tela de entrada e tela de
conversa.

O JavaScript de cliente SHALL se limitar a enviar a mensagem e desenhar a resposta.

A página SHALL NOT usar framework, SHALL NOT exigir etapa de build, SHALL NOT carregar
recurso de origem externa e SHALL NOT conter regra de negócio — nenhuma decisão sobre
estado de anamnese, classificação ou persona.

Todo texto vindo do participante ou do assistente SHALL ser inserido como texto, nunca
como HTML interpretado.

Motivo registrado: o requisito de ausência de JavaScript vale para o admin, que é
ferramenta interna de um operador atrás de login. A página pública tem outro público e
outra expectativa: sem o envio assíncrono, cada mensagem recarregaria a página e
perderia o foco do campo — atrito justamente onde o produto existe para reduzi-lo. O
limite existe para que "JavaScript mínimo" não vire, com o tempo, uma aplicação de
cliente com regra duplicada.

#### Scenario: Sem dependência externa
- **WHEN** a página é carregada sem acesso à internet além do próprio servidor
- **THEN** ela funciona integralmente

#### Scenario: Texto do participante não vira marcação
- **WHEN** o participante envia texto que se parece com HTML
- **THEN** ele aparece como texto na conversa

### Requirement: Servidor web isolado do admin e do processo

O canal web SHALL ser servido pelo mesmo processo que conversa com o WhatsApp, e
SHALL NOT depender de chamada de rede para outro container.

O canal web SHALL escutar em porta própria, distinta da porta do backend
administrativo, e SHALL NOT compartilhar o mesmo servidor HTTP com ele.

Falha no tratamento de uma requisição web SHALL NOT derrubar o processo nem
interromper o canal WhatsApp ou o agendador.

Nenhuma rota do canal web SHALL listar participantes, expor dado de outro participante
ou oferecer qualquer operação administrativa.

Motivo registrado: o processo do bot passa a escutar uma porta pública, e antes não
escutava nenhuma. Servidor separado é o que faz uma rota mal configurada não alcançar
o admin — a diferença entre um erro improvável e um erro impossível.

#### Scenario: Erro numa requisição não derruba o bot
- **WHEN** uma rota do canal web lança exceção
- **THEN** a requisição falha, e o WhatsApp e o agendador continuam funcionando

#### Scenario: Canal web não alcança o admin
- **WHEN** uma rota administrativa é solicitada na porta pública
- **THEN** não é atendida
