## MODIFIED Requirements

### Requirement: Convidar piloto novo

O admin SHALL oferecer um formulário de convite que recebe um número de WhatsApp e uma
data de nascimento, e executa o convite proativo.

A data de nascimento SHALL ser gravada no participante e SHALL ser exigida no convite.

A ação SHALL ser oferecida apenas quando o número não existir no banco, ou existir com
`anamnese_estado = 0` e sem consentimento aceito.

O sistema SHALL NOT oferecer essa ação sobre usuário com qualquer progresso de
anamnese.

O convite SHALL continuar enviando o texto de consentimento pelo WhatsApp,
independentemente de qual canal a pessoa venha a usar depois.

Motivo registrado: o convite reseta o estado da anamnese incondicionalmente. Restrito a
esse recorte, não há progresso a perder. A data de nascimento entra aqui para que exista
**um** ponto de pré-cadastro: um segundo caminho, só para quem fosse usar a web, criaria
um segundo conjunto de regras sobre quando o estado 0 começa.

#### Scenario: Número novo pode ser convidado
- **WHEN** o operador informa um número que não existe no banco e uma data de nascimento
- **THEN** o usuário é criado no estado 0, com a data gravada, e recebe o texto de
  consentimento

#### Scenario: Usuário com progresso não recebe a ação de convite
- **WHEN** a página de um usuário no estado 5 é exibida
- **THEN** a ação de convidar não é oferecida para ele

#### Scenario: Convite sem data de nascimento é recusado
- **WHEN** o operador envia o formulário sem a data de nascimento
- **THEN** o convite é recusado e nenhum participante é criado ou alterado

#### Scenario: Data inválida é recusada antes do banco
- **WHEN** o operador informa uma data malformada ou no futuro
- **THEN** a gravação é recusada com mensagem legível
