# canal-whatsapp Specification

## Purpose

Conectar o assistente ao WhatsApp, rotear cada mensagem recebida para o fluxo certo (anamnese
ou conversa normal), transcrever áudio, e — o mais importante para o piloto — iniciar o
onboarding de forma proativa, com o bot falando primeiro.

## Requirements

### Requirement: Conexão WhatsApp com sessão persistida

O sistema SHALL conectar ao WhatsApp pela biblioteca não-oficial `@whiskeysockets/baileys`,
persistindo o estado de autenticação em diretório configurável.

O sistema SHALL exibir o QR de pareamento no terminal na primeira execução.

O sistema SHALL reconectar automaticamente em queda de conexão, exceto quando o motivo for
logout — nesse caso SHALL parar e avisar que é preciso parear de novo.

Motivo registrado: biblioteca não-oficial é escolha consciente do piloto; a migração para a API
oficial acontece depois da validação.

#### Scenario: Logout não entra em loop de reconexão
- **WHEN** a conexão cai com motivo de logout
- **THEN** o sistema para de tentar reconectar e informa que é necessário parear novamente

### Requirement: Filtro de origem de mensagem

O sistema SHALL ignorar mensagens enviadas pelo próprio bot e mensagens de grupo, processando
apenas conversa individual recebida.

Esse filtro SHALL permanecer no adaptador do WhatsApp e SHALL NOT ser levado para o
núcleo de conversa.

Motivo registrado: é comportamento de transporte — grupo e eco do próprio remetente são
conceitos do WhatsApp, sem equivalente num canal onde a identidade vem de uma sessão.

#### Scenario: Mensagem de grupo ignorada
- **WHEN** chega mensagem de um grupo
- **THEN** nada é processado nem registrado

#### Scenario: Eco do próprio bot ignorado
- **WHEN** chega no fluxo uma mensagem marcada como enviada pelo próprio bot
- **THEN** ela é descartada

### Requirement: Onboarding proativo por convite

O caminho principal de onboarding SHALL ser um convite proativo: o sistema cria (ou reaproveita
pelo número) o usuário, coloca a anamnese no estado 0 e **envia** o texto de consentimento sem
esperar mensagem do usuário.

A primeira mensagem que a pessoa enviar de volta SHALL ser processada como resposta ao
consentimento pela máquina de estados.

O sistema SHALL expor esse convite como comando de linha de comando que recebe o número, espera
a conexão abrir com tempo limite, convida e encerra.

O sistema SHALL NOT depender de onboarding reativo como fluxo principal.

Motivo registrado: o fluxo reativo obriga a pessoa a mandar mensagem duas vezes antes de
qualquer coisa acontecer, e desalinha a contagem de passos da conversa com o que a máquina de
estados espera.

#### Scenario: Convite abre a conversa
- **WHEN** o convite é executado para um número novo
- **THEN** o usuário é criado no estado 0 e recebe o texto de consentimento sem ter escrito nada

#### Scenario: Convite repetido reaproveita o usuário
- **WHEN** o convite é executado para um número que já existe
- **THEN** o mesmo usuário é reaproveitado, sem duplicação

### Requirement: Rede de segurança para mensagem fora de fluxo

Quando chegar mensagem de alguém sem anamnese iniciada, o sistema SHALL devolver o texto de
consentimento e aguardar.

Esse caminho SHALL ser tratado como rede de segurança, não como o fluxo pretendido.

Essa rede de segurança SHALL permanecer no adaptador do WhatsApp e SHALL NOT ser
generalizada para outros canais.

Motivo registrado: no canal web não existe mensagem de remetente desconhecido — quem não
tem sessão válida é recusado antes de qualquer processamento, e criar participante ali
seria autocadastro num sistema que guarda dado de saúde.

#### Scenario: Mensagem de desconhecido
- **WHEN** chega mensagem de um número sem usuário ou com estado de anamnese ausente
- **THEN** o sistema responde com o texto de consentimento

#### Scenario: Sem equivalente na web
- **WHEN** uma requisição web chega sem sessão válida
- **THEN** é recusada, e nenhum participante é criado

### Requirement: Roteamento por estado de anamnese

O roteamento SHALL ser responsabilidade do núcleo de conversa, e SHALL valer
igualmente para qualquer canal.

Quando o estado de anamnese do usuário for menor que 12, o sistema SHALL rotear a mensagem para
o passo de anamnese.

Quando o estado for 12, o sistema SHALL classificar a mensagem, montar o system prompt da
persona e responder via LLM.

O sistema SHALL registrar a interação como `resposta_gatilho` ou `despejo_espontaneo` conforme
a classificação, incrementando o contador semanal quando for despejo, e SHALL registrar o
canal de origem em qualquer caso.

O adaptador do WhatsApp SHALL NOT reimplementar esse roteamento.

Motivo registrado: enquanto a decisão viver dentro do adaptador, acrescentar um canal
significa copiá-la — e a partir da primeira cópia as duas divergem em silêncio, cada
correção valendo só para um lado.

#### Scenario: Usuário em anamnese
- **WHEN** chega mensagem de usuário no estado 4
- **THEN** a mensagem é processada pela máquina de estados, não pelo fluxo de conversa normal

#### Scenario: Despejo espontâneo contabilizado
- **WHEN** chega mensagem de usuário concluído, fora da janela de gatilho
- **THEN** a interação é registrada como `despejo_espontaneo` e o contador semanal é incrementado

#### Scenario: Mesma decisão nos dois canais
- **WHEN** a mesma mensagem chega pelo WhatsApp e pela web, para o mesmo participante no
  mesmo estado
- **THEN** o roteamento é idêntico

### Requirement: Transcrição de áudio

Quando a mensagem recebida contiver áudio, o sistema SHALL transcrevê-la antes de qualquer
roteamento, usando a API de transcrição da OpenAI e idioma `pt`.

O modelo de transcrição SHALL ser resolvido consultando primeiro as credenciais configuradas
e, na ausência delas, a variável de ambiente, mantendo `gpt-4o-transcribe` como padrão.

A chave usada SHALL ser a mesma configurada para o provedor OpenAI.

Falha de rede ou de API na transcrição SHALL retornar um resultado que o handler consiga
registrar em log, sem derrubar a conversa.

O resultado de falha SHALL conter apenas o provedor e o código de status, e SHALL NOT conter o
corpo bruto da resposta.

Motivo registrado: o handler escreve esse resultado em `console.error`, e o corpo de um 401
pode ecoar a credencial recebida — é o mesmo vazamento em potencial que motivou descartar o
corpo no router, por um caminho que aquela correção não cobria.

#### Scenario: Áudio transcrito antes do roteamento
- **WHEN** chega uma mensagem de áudio de usuário em anamnese
- **THEN** o áudio é transcrito e o texto resultante é processado pela máquina de estados

#### Scenario: Falha de transcrição não derruba a conversa
- **WHEN** a API de transcrição retorna erro
- **THEN** o erro é registrado em log e o processo continua rodando

#### Scenario: Erro de transcrição não carrega o corpo
- **WHEN** a API de transcrição responde 401
- **THEN** o resultado de falha menciona o código de status e não contém o corpo da resposta

#### Scenario: Modelo vindo da tela
- **WHEN** o modelo de transcrição foi configurado pela tela de credenciais
- **THEN** a próxima transcrição usa esse modelo, sem reinício

