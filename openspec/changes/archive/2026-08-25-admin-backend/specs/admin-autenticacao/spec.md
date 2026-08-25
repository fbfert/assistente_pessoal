## Purpose

Proteger a superfície de operação do piloto com uma camada de autenticação que viaja
junto com o código. O bind em loopback basta para leitura; escrita sobre dado de saúde
de pessoas identificadas exige saber quem está do outro lado.

## ADDED Requirements

### Requirement: Senha única de operador

O admin SHALL exigir uma senha única, lida da variável de ambiente `ADMIN_PASSWORD`.

O processo do admin SHALL recusar-se a subir quando `ADMIN_PASSWORD` estiver ausente ou
vazia, em vez de subir sem proteção.

Motivo registrado: um admin que sobe sem senha por configuração faltando é pior que um
admin que não sobe — o primeiro expõe dado de saúde sem que ninguém perceba.

#### Scenario: Variável ausente impede a subida
- **WHEN** o processo do admin inicia sem `ADMIN_PASSWORD` definida
- **THEN** ele encerra com erro explicando o que falta, e não passa a atender requisições

### Requirement: Comparação de senha em tempo constante

A comparação da senha recebida com a esperada SHALL usar `crypto.timingSafeEqual`.

A comparação SHALL NOT usar `===` nem qualquer comparação que termine no primeiro
caractere divergente.

Motivo registrado: comparação curto-circuitada vaza, por diferença de tempo de
resposta, o tamanho do prefixo correto — o que permite reconstruir a senha caractere a
caractere.

#### Scenario: Senhas de tamanhos diferentes não quebram a comparação
- **WHEN** a senha enviada tem tamanho diferente da esperada
- **THEN** a comparação retorna falso sem lançar exceção

### Requirement: Sessão por cookie assinado

Após autenticação bem-sucedida, o admin SHALL emitir um cookie de sessão assinado.

O cookie SHALL ser marcado `HttpOnly` e `SameSite=Strict`, e SHALL ser marcado `Secure`
quando a requisição chegar por HTTPS.

O estado de sessão SHALL viver na memória do processo, sem banco de sessão externo.

#### Scenario: Cookie forjado é rejeitado
- **WHEN** chega uma requisição com cookie de sessão cuja assinatura não confere
- **THEN** a requisição é tratada como não autenticada

#### Scenario: Reinício do processo encerra as sessões
- **WHEN** o processo do admin reinicia
- **THEN** as sessões anteriores deixam de ser válidas e o operador precisa autenticar de novo

### Requirement: Proteção de todas as rotas exceto login e health

O admin SHALL exigir sessão válida em toda rota, com exceção da rota de login e da rota
de health.

Requisição sem sessão válida a uma rota protegida SHALL ser redirecionada para o login,
e SHALL NOT expor qualquer dado do piloto no corpo ou nos cabeçalhos da resposta.

#### Scenario: Rota de detalhe sem sessão
- **WHEN** alguém sem sessão acessa a página de detalhe de um usuário
- **THEN** recebe redirecionamento para o login e nenhum dado da pessoa é exposto

#### Scenario: Health continua público
- **WHEN** a rota de health é acessada sem sessão
- **THEN** ela responde normalmente, sem expor dado do piloto

### Requirement: Registro de tentativa de autenticação falha

O admin SHALL registrar em log toda tentativa de autenticação malsucedida.

O log SHALL NOT conter a senha tentada, nem em texto claro nem em forma reversível.

#### Scenario: Falha registrada sem vazar a tentativa
- **WHEN** uma autenticação falha
- **THEN** o log registra a ocorrência e não contém a senha enviada
