## MODIFIED Requirements

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
