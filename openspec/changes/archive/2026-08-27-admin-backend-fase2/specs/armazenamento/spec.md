## ADDED Requirements

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
