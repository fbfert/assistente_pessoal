## Purpose

Tornar visível, fora do terminal, o estado da conexão com o WhatsApp e o QR de
pareamento pendente. O bot publica; o admin lê. São processos separados que só
compartilham o volume do banco.

## ADDED Requirements

### Requirement: Estado publicado em tabela de linha única

O sistema SHALL manter o estado da conexão em uma tabela `estado_conexao` de linha
única, com os campos `conectado`, `qr_atual`, `motivo_desconexao` e `atualizado_em`.

A unicidade da linha SHALL ser garantida pelo próprio banco, e não por convenção de
código.

O estado SHALL NOT ser publicado em arquivo solto no volume.

Motivo registrado: o bot e o admin são containers separados que compartilham apenas o
volume. Arquivo avulso não tem tipo, transação nem escrita atômica; o projeto já
escolheu armazenamento estruturado em todos os outros pontos.

#### Scenario: Segunda linha é rejeitada
- **WHEN** uma escrita tenta inserir uma linha com identificador diferente do único
  permitido
- **THEN** o banco rejeita a escrita

### Requirement: Bot publica cada transição de conexão

O processo do bot SHALL gravar o estado a cada atualização de conexão:

- ao receber um QR: `conectado = 0` e o QR bruto em `qr_atual`;
- ao conectar: `conectado = 1`, `qr_atual` limpo e `motivo_desconexao` limpo;
- ao cair: `conectado = 0`, `qr_atual` limpo e o motivo registrado, distinguindo o caso
  de logout.

A gravação SHALL NOT alterar a lógica de reconexão automática já existente.

O valor armazenado em `qr_atual` SHALL ser o texto bruto do QR, não uma imagem.

#### Scenario: QR recebido fica disponível para o admin
- **WHEN** o bot recebe um QR de pareamento
- **THEN** o texto bruto do QR fica gravado e o estado consta como não conectado

#### Scenario: Conexão aberta limpa o QR
- **WHEN** a conexão é estabelecida
- **THEN** o estado consta como conectado e não há QR pendente

#### Scenario: Logout é distinguível de queda comum
- **WHEN** a conexão cai por logout
- **THEN** o motivo registrado permite distinguir esse caso, que exige novo pareamento
  presencial

### Requirement: Admin exibe o estado e o QR como imagem

O admin SHALL exibir uma página com o estado da conexão e há quanto tempo ele foi
atualizado.

Havendo QR pendente e válido, a página SHALL renderizá-lo como imagem escaneável
embutida, e SHALL NOT exibi-lo como texto.

#### Scenario: QR escaneável na tela
- **WHEN** há QR pendente e o operador abre a página de conexão
- **THEN** o QR aparece como imagem escaneável pelo celular

#### Scenario: Estado conectado
- **WHEN** a conexão está estabelecida
- **THEN** a página informa que está conectado e não exibe QR

### Requirement: QR vencido não é exibido como válido

O admin SHALL tratar como expirado o QR cuja última atualização exceda a validade
esperada, e SHALL informar isso em vez de exibi-lo.

Motivo registrado: o QR do WhatsApp expira em segundos. Exibir um QR morto como se
fosse válido faz o operador tentar escanear repetidamente sem entender por que falha.

#### Scenario: QR antigo é sinalizado
- **WHEN** o QR gravado é mais antigo que a validade esperada
- **THEN** a página informa que ele expirou, em vez de mostrá-lo

### Requirement: Página se atualiza sozinha enquanto aguarda

Enquanto o estado for não conectado, a página de conexão SHALL se atualizar
periodicamente sem intervenção do operador, por mecanismo que não dependa de JavaScript
de cliente.

#### Scenario: Espera sem recarregar na mão
- **WHEN** o operador abre a página de conexão com o bot desconectado
- **THEN** a página se atualiza sozinha até que a conexão seja estabelecida
