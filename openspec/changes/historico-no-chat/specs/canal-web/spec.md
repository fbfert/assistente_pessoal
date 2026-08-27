## ADDED Requirements

### Requirement: Conversa anterior devolvida sob demanda

O canal web SHALL oferecer uma rota autenticada que devolve as **últimas 50 mensagens**
de conversa do participante da sessão, em ordem cronológica.

A rota SHALL identificar o participante pela sessão, e SHALL NOT aceitar identificador
vindo do corpo, da URL ou de cabeçalho.

A rota SHALL devolver **apenas** tipos de mensagem de conversa, por lista fechada de
tipos permitidos — nunca por lista de exclusão.

O sistema SHALL NOT devolver por essa rota: registro de entrada no canal, ação do
operador, nota de aprendizado de perfil, contabilização de silêncio e, em nenhuma
hipótese, **resposta bloqueada por segurança**.

Cada mensagem devolvida SHALL indicar de quem é — participante ou assistente — e quando
foi.

Motivo registrado: lista de exclusão erra por omissão quando um tipo novo aparece, e
este projeto criou quatro tipos de interação em um único dia. Quanto à resposta
bloqueada: ela é exatamente o texto que o sistema recusou entregar, e devolvê-la pela
rota de histórico anularia o bloqueio inteiro por uma porta que ninguém pensou em
trancar.

#### Scenario: A pessoa recupera a conversa
- **WHEN** um participante com conversa anterior pede o histórico
- **THEN** recebe as últimas mensagens dela e do assistente, em ordem

#### Scenario: Resposta bloqueada nunca sai
- **WHEN** existe resposta bloqueada por segurança no histórico do participante
- **THEN** ela não aparece no que a rota devolve

#### Scenario: Registro interno não é conversa
- **WHEN** o histórico contém entrada no canal, ação do operador ou nota de aprendizado
- **THEN** nenhum deles aparece no que a rota devolve

#### Scenario: Sem sessão não há histórico
- **WHEN** a rota é chamada sem sessão válida
- **THEN** é recusada, sem revelar se aquele participante existe

#### Scenario: Identidade vem da sessão
- **WHEN** a requisição tenta indicar outro participante
- **THEN** o campo é ignorado e o histórico devolvido é o do dono da sessão

### Requirement: A conversa anterior aparece sob clique, não sozinha

A tela de conversa SHALL abrir sem a conversa anterior carregada, oferecendo uma ação
explícita para trazê-la.

A ação SHALL desaparecer depois de usada, e o sistema SHALL NOT permitir carregar o
histórico duas vezes na mesma tela.

Motivo registrado: a sessão dura horas e o token vive no navegador, então quem reabre a
aba pode não ser quem conversou. Carregar sozinho poria semanas de conversa sobre saúde
na tela sem ninguém ter pedido. O custo é um clique, e o texto da ação evita que a tela
vazia pareça perda de dado.

#### Scenario: Tela abre limpa
- **WHEN** a pessoa reabre a aba com sessão válida
- **THEN** a conversa anterior não é carregada, e existe uma ação visível para trazê-la

#### Scenario: Carrega uma vez só
- **WHEN** a conversa anterior é carregada
- **THEN** a ação some, e nenhuma mensagem aparece duplicada

## MODIFIED Requirements

### Requirement: Página pública com JavaScript mínimo e delimitado

A página SHALL ser servida pelo próprio sistema, com tela de entrada e tela de
conversa.

O JavaScript de cliente SHALL se limitar a enviar a mensagem, pedir a conversa anterior
quando a pessoa acionar, e desenhar o que voltar.

A página SHALL NOT usar framework, SHALL NOT exigir etapa de build, SHALL NOT carregar
recurso de origem externa e SHALL NOT conter regra de negócio — nenhuma decisão sobre
estado de anamnese, classificação ou persona.

A página SHALL NOT guardar conversa no navegador: o servidor é a fonte, e o que for
carregado vive apenas na tela.

Todo texto vindo do participante ou do assistente SHALL ser inserido como texto, nunca
como HTML interpretado.

Motivo registrado: o requisito de ausência de JavaScript vale para o admin, que é
ferramenta interna de um operador atrás de login. A página pública tem outro público e
outra expectativa: sem o envio assíncrono, cada mensagem recarregaria a página e
perderia o foco do campo — atrito justamente onde o produto existe para reduzi-lo. O
limite existe para que "JavaScript mínimo" não vire, com o tempo, uma aplicação de
cliente com regra duplicada. Guardar o transcrito no navegador seria conversa sobre
saúde parada num aparelho sem prazo nenhum — o token já é um risco assumido, e ele ao
menos expira.

#### Scenario: Sem dependência externa
- **WHEN** a página é carregada sem acesso à internet além do próprio servidor
- **THEN** ela funciona integralmente

#### Scenario: Texto do participante não vira marcação
- **WHEN** o participante envia texto que se parece com HTML
- **THEN** ele aparece como texto na conversa

#### Scenario: Nada de conversa fica no navegador
- **WHEN** a conversa anterior é carregada e a aba é fechada
- **THEN** nada dela permanece armazenado no navegador
