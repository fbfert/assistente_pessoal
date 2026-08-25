# admin-autenticacao Specification

## Purpose

Proteger a superfície de operação do piloto com uma camada de autenticação que viaja
junto com o código. O bind em loopback basta para leitura; escrita sobre dado de saúde
de pessoas identificadas exige saber quem está do outro lado.

## Requirements

### Requirement: Senha única de operador

O admin SHALL autenticar por **e-mail e senha de uma conta persistida**, e SHALL
NOT aceitar uma senha única de processo como credencial de login.

A variável `ADMIN_PASSWORD` SHALL servir apenas como semente do bootstrap
descrito abaixo.

O processo do admin SHALL recusar-se a subir quando não houver nenhuma conta
cadastrada e faltar a semente de bootstrap, em vez de subir sem proteção.

Motivo registrado: senha única não identifica quem agiu. A auditoria registra
alteração sobre dado de saúde de pessoa identificada; sem autor, ela responde
metade da pergunta. Manter o login por senha única vivo ao lado das contas
nominais seria o pior dos dois mundos — a identificação some sem ninguém notar.

#### Scenario: Variável ausente impede a subida
- **WHEN** o processo do admin inicia sem nenhuma credencial configurada e sem conta cadastrada
- **THEN** ele encerra com erro explicando o que falta, e não passa a atender requisições

#### Scenario: Sem conta e sem semente, o processo não sobe
- **WHEN** o admin inicia com a tabela de contas vazia e sem semente de bootstrap
- **THEN** encerra com erro explicando o que falta, e não passa a atender requisições

#### Scenario: A senha de ambiente não é mais aceita no login
- **WHEN** alguém tenta autenticar usando a semente de bootstrap depois de a conta existir
- **THEN** a autenticação só é aceita se corresponder à credencial da conta

### Requirement: Comparação de senha em tempo constante

A verificação de senha SHALL derivar o hash com um algoritmo de derivação lento e
comparar o resultado em tempo constante.

A comparação SHALL NOT usar `===` nem qualquer comparação que termine no primeiro
byte divergente.

Quando o e-mail informado não existir, o sistema SHALL executar mesmo assim uma
derivação de custo equivalente antes de responder.

Motivo registrado: sem o trabalho descartável, o tempo de resposta separa
"e-mail inexistente" de "senha errada", e a tela de login vira um enumerador de
contas.

#### Scenario: E-mail inexistente não é distinguível por tempo
- **WHEN** uma tentativa usa um e-mail que não existe
- **THEN** a resposta é a mesma de senha errada, após trabalho de custo equivalente

#### Scenario: Senhas de tamanhos diferentes não quebram a comparação
- **WHEN** a senha enviada tem tamanho diferente da esperada
- **THEN** a verificação retorna falso sem lançar exceção

### Requirement: Sessão por cookie assinado

Após autenticação bem-sucedida, o admin SHALL emitir um cookie de sessão assinado.

A sessão SHALL registrar qual conta a originou.

O cookie SHALL ser marcado `HttpOnly` e `SameSite=Strict`, e SHALL ser marcado
`Secure` quando a requisição chegar por HTTPS.

O estado de sessão SHALL viver na memória do processo, sem banco de sessão externo.

#### Scenario: Cookie forjado é rejeitado
- **WHEN** chega uma requisição com cookie de sessão cuja assinatura não confere
- **THEN** a requisição é tratada como não autenticada

#### Scenario: A sessão identifica o autor
- **WHEN** uma requisição autenticada chega
- **THEN** é possível determinar qual conta está agindo

#### Scenario: Reinício do processo encerra as sessões
- **WHEN** o processo do admin reinicia
- **THEN** as sessões anteriores deixam de ser válidas

### Requirement: Proteção de todas as rotas exceto login e health

O admin SHALL exigir sessão válida em toda rota, com exceção da rota de login e
da rota de health.

Requisição sem sessão válida a uma rota protegida SHALL ser redirecionada para o
login, e SHALL NOT expor qualquer dado do piloto no corpo ou nos cabeçalhos da
resposta.

Sessão de conta com troca de senha pendente SHALL alcançar apenas a tela de troca
de senha e a saída, e SHALL NOT alcançar página que exiba dado de participante.

#### Scenario: Rota de detalhe sem sessão
- **WHEN** alguém sem sessão acessa a página de detalhe de um usuário
- **THEN** recebe redirecionamento para o login e nenhum dado da pessoa é exposto

#### Scenario: Health continua público
- **WHEN** a rota de health é acessada sem sessão
- **THEN** ela responde normalmente, sem expor dado do piloto

#### Scenario: Pendência de troca restringe a sessão
- **WHEN** uma conta com senha temporária pendente acessa o painel
- **THEN** é desviada para a troca de senha, sem ver dado de participante

### Requirement: Registro de tentativa de autenticação falha

O admin SHALL registrar em log toda tentativa de autenticação malsucedida,
incluindo o e-mail tentado.

O log SHALL NOT conter a senha tentada, nem em texto claro nem em forma reversível.

#### Scenario: Falha registrada sem vazar a tentativa
- **WHEN** uma autenticação falha
- **THEN** o log registra o e-mail e a origem, e não contém a senha enviada

### Requirement: Bootstrap da conta inicial

Quando não houver nenhuma conta cadastrada, o admin SHALL criar uma a partir das
variáveis de ambiente de e-mail e senha de bootstrap.

O bootstrap SHALL ocorrer uma única vez: havendo qualquer conta, ele SHALL NOT
criar outra nem alterar a existente.

Motivo registrado: sem isso, um deploy limpo deixa o operador trancado para fora,
sem nenhum caminho de entrada.

#### Scenario: Primeira subida cria a conta
- **WHEN** o admin sobe com a tabela de contas vazia e as variáveis definidas
- **THEN** uma conta ativa é criada e permite login imediato

#### Scenario: Subida seguinte não recria
- **WHEN** o admin sobe com uma conta já existente
- **THEN** nenhuma conta é criada, e a senha da existente permanece intacta

### Requirement: Troca da própria senha

Todo administrador autenticado SHALL poder trocar a própria senha, informando a
senha atual antes de a nova ser aceita.

A troca SHALL rejeitar senha atual incorreta, e SHALL exigir confirmação da nova.

Após a troca, as demais sessões daquela conta SHALL ser encerradas.

#### Scenario: Senha atual incorreta bloqueia a troca
- **WHEN** o administrador informa a senha atual errada
- **THEN** a senha não é alterada

#### Scenario: Troca encerra as outras sessões
- **WHEN** a senha é trocada com sucesso
- **THEN** sessões abertas em outros navegadores deixam de valer

### Requirement: Senha nunca armazenada de forma recuperável

A senha SHALL ser armazenada apenas como hash derivado com sal por conta.

O sistema SHALL NOT armazenar, registrar em log nem devolver em qualquer resposta
a senha em texto claro.

#### Scenario: A senha não aparece em resposta alguma
- **WHEN** qualquer página do admin é servida
- **THEN** nenhuma senha em texto claro aparece no corpo da resposta
