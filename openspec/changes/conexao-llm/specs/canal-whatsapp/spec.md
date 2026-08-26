## MODIFIED Requirements

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
