## Purpose

Reunir núcleo fixo, variantes de tom e escolha de provedor numa página só, e
permitir experimentar o efeito de uma alteração contra o LLM real antes de
publicá-la — em vez de descobrir o efeito quando um participante responder.

## ADDED Requirements

### Requirement: Persona reunida em uma tela

A tela SHALL apresentar, para edição: o núcleo fixo, as três variantes de tom e o
provedor de LLM ativo.

A gravação do núcleo fixo SHALL exigir a confirmação reforçada; as variantes SHALL
usar a confirmação padrão.

A tela SHALL NOT exibir nem aceitar chave de API.

#### Scenario: Provedor sem chave
- **WHEN** a tela é exibida
- **THEN** mostra qual provedor está ativo e nenhum campo de chave de API

### Requirement: Teste de mensagem isolado do piloto

A tela SHALL oferecer um campo onde o operador escreve uma mensagem de exemplo,
escolhe a variante e recebe a resposta real do LLM.

A montagem do prompt SHALL usar um contexto de anamnese fictício, definido no
código.

A chamada SHALL NOT gravar em `historico_interacoes`, SHALL NOT referenciar
nenhum participante e SHALL NOT alterar contador algum.

O sistema SHALL NOT permitir usar o contexto de um participante real no teste.

Motivo registrado: calibrar o núcleo fixo sem teste significa publicar para todos
e esperar alguém em sobrecarga servir de ambiente de validação. Usar o contexto de
alguém real, por outro lado, transformaria o teste numa forma de ler dado de saúde
sem abrir a página da pessoa, fora do rastro de auditoria.

#### Scenario: Teste não deixa rastro no piloto
- **WHEN** o operador testa uma mensagem
- **THEN** nenhuma linha é acrescentada ao histórico de nenhum participante

#### Scenario: Resposta exibida na própria tela
- **WHEN** o teste é executado
- **THEN** a resposta do modelo aparece na mesma página

### Requirement: Teste sobre o rascunho não salvo

O teste SHALL usar o conteúdo presente no formulário, mesmo que ainda não tenha
sido salvo.

Motivo registrado: testar apenas o que já está salvo inverte a ordem útil —
obrigaria a publicar para todos os participantes e só então observar o efeito, que
é exatamente o que o teste existe para evitar.

#### Scenario: Rascunho testado antes de publicar
- **WHEN** o operador altera uma variante na tela e testa sem salvar
- **THEN** a resposta reflete o texto do formulário, e o conteúdo salvo permanece
  inalterado

### Requirement: Falha do provedor não derruba a tela

Erro na chamada ao LLM SHALL ser exibido como mensagem na própria tela, e SHALL NOT
impedir o restante da página de funcionar.

#### Scenario: Provedor indisponível
- **WHEN** a chamada de teste falha
- **THEN** a tela informa a falha e continua permitindo editar e salvar

### Requirement: Limite de uso do teste

O sistema SHALL limitar quantos testes um administrador pode disparar por hora.

O teto SHALL ser uma chave da configuração viva, com padrão de vinte, e SHALL
poder ser alterado sem implantação.

O valor zero SHALL significar sem limite.

Ao atingir o teto, o sistema SHALL recusar o teste com mensagem explicando quando
volta a ser possível, e SHALL NOT chamar o provedor.

Motivo registrado: cada teste é uma chamada real e paga. O limite existe para o
caso acidental — formulário reenviado em laço, aba esquecida recarregando —, não
para racionar uso legítimo; por isso o teto é configurável em vez de constante.

#### Scenario: Teto atingido não chama o provedor
- **WHEN** um administrador excede o teto na mesma hora
- **THEN** o teste é recusado com a explicação, e nenhuma chamada é feita à API

#### Scenario: Teto alterado vale de imediato
- **WHEN** o teto é alterado na configuração
- **THEN** o novo valor passa a valer sem reinício

#### Scenario: Zero desliga o limite
- **WHEN** o teto está em zero
- **THEN** nenhum teste é recusado por limite
