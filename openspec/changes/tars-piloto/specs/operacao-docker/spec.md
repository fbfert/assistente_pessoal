## Purpose

Empacotar o piloto para rodar self-hosted no servidor com um comando, preservando entre
reinícios as duas coisas que não podem ser perdidas: o banco e a sessão pareada do WhatsApp.

## ADDED Requirements

### Requirement: Imagem com toolchain de compilação nativa

A imagem SHALL partir de Node 22 sobre Debian slim e SHALL instalar `python3`, `make`, `g++` e
certificados de CA, porque `better-sqlite3` compila binário nativo.

A instalação de dependências SHALL omitir dependências de desenvolvimento.

#### Scenario: Build sem toolchain falha cedo
- **WHEN** a imagem é construída
- **THEN** a compilação de `better-sqlite3` conclui com sucesso

### Requirement: Estado persistido em volume

O banco e o diretório de autenticação do WhatsApp SHALL viver sob `/data`, declarado como
volume.

Os dois serviços SHALL compartilhar o mesmo volume nomeado.

#### Scenario: Reinício preserva o pareamento
- **WHEN** os containers são recriados
- **THEN** a sessão do WhatsApp continua pareada e o banco continua íntegro

### Requirement: Dois serviços sobre a mesma imagem

A composição SHALL definir dois serviços a partir da mesma imagem: o bot e o dashboard, este
último com comando sobrescrito.

O serviço do bot SHALL manter terminal interativo, para que o QR de pareamento seja legível nos
logs.

#### Scenario: QR visível no log
- **WHEN** o bot sobe sem sessão pareada
- **THEN** o QR é legível na saída de log do container

### Requirement: Porta do dashboard restrita a loopback

A porta do dashboard SHALL ser publicada apenas em `127.0.0.1`.

#### Scenario: Sem exposição pública
- **WHEN** a composição é inspecionada
- **THEN** o mapeamento de porta do dashboard começa por `127.0.0.1`

### Requirement: Número dedicado e não-VoIP

O pareamento SHALL usar um número separado do já usado em produção na Xiax, em chip físico.

O procedimento SHALL NOT usar número virtual ou VoIP, porque o WhatsApp rejeita esse tipo de
número no registro.

#### Scenario: Procedimento documentado
- **WHEN** o README descreve o primeiro pareamento
- **THEN** ele declara explicitamente número separado e chip físico não-VoIP

### Requirement: Segredos fora do repositório

O arquivo de ambiente com chaves SHALL ser ignorado pelo controle de versão, e SHALL existir um
arquivo de exemplo documentando todas as variáveis sem valores reais.

Os diretórios de dados e de autenticação SHALL ser ignorados pelo controle de versão.

Como o repositório tem raiz no diretório home da conta de hospedagem, o controle de versão
SHALL ignorar também os diretórios da hospedagem (`Maildir`, `public_html`, `logs`, `etc`,
`cgi-bin`, `virtualmin-backup`).

#### Scenario: Dado de hospedagem não entra no commit
- **WHEN** o estado do repositório é inspecionado antes do primeiro commit
- **THEN** nenhum arquivo de e-mail, site público ou backup aparece como rastreado
