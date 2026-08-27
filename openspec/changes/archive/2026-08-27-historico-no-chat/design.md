## Context

- `listarInteracoes(usuarioId, db)` já devolve o histórico inteiro, em ordem — é o que a
  página do admin usa.
- Desde a mudança `conversa-confiavel`, o histórico tem **os dois lados**:
  `mensagem_enviada` guarda o que o assistente respondeu. Antes disso, só a mensagem
  recebida era gravada.
- A tabela guarda muito mais que conversa: `entrada_web`, `acao_admin`,
  `aprendizado_perfil`, `silencio` e `resposta_bloqueada_seguranca` convivem com as
  mensagens.
- A página mantém o transcrito **em memória**, e o token no `localStorage`. Recarregar
  perde a tela, não a sessão.

## Goals / Non-Goals

**Goals:**

- Quem reabre a aba consegue ver o que já foi conversado.
- Nada que não seja mensagem de conversa sai pela rota.
- A tela não fica mais pesada nem mais complicada por causa disso.

**Non-Goals:**

- Paginação, busca, exportação.
- Guardar transcrito no navegador — o servidor é a fonte, e o `localStorage` não deve
  acumular conversa sobre saúde sem prazo.
- Recuperar as respostas do assistente anteriores a `mensagem_enviada`: elas não existem.

## Decisions

### Só mensagem de conversa sai pela rota

A rota devolve **uma lista fechada de tipos**, e não "tudo menos alguns": lista de
exclusão erra por omissão quando um tipo novo aparece, e este projeto já criou quatro
tipos em um dia.

Entram: as mensagens da pessoa (anamnese, resposta a gatilho, despejo espontâneo,
correção reportada) e as do sistema (mensagem enviada, gatilho disparado).

Fica de fora, sempre:

- `entrada_web` e `acao_admin` — registro interno, não conversa;
- `aprendizado_perfil` — é o que o sistema deduziu sobre ela, não o que foi dito; ver
  abaixo;
- **`resposta_bloqueada_seguranca`** — é exatamente o texto que o sistema recusou
  entregar. Devolvê-lo pela rota de histórico anularia o bloqueio inteiro, por uma porta
  que ninguém pensou em trancar.

O gatilho disparado entra de propósito, mesmo tendo saído pelo WhatsApp: é a mesma
conversa, e ver o check-in da manhã na tela do navegador é o comportamento correto de um
sistema com dois transportes e um histórico só.

**Nota de aprendizado não aparece.** Ela é inferência do sistema sobre a pessoa, e
mostrá-la de volta transformaria a conversa numa devolutiva de perfil — que é outro
produto, e que precisaria de outra conversa sobre consentimento.

### Cinquenta mensagens, por contagem e não por tempo

Corte por tempo pune exatamente quem este produto atende: quem some por três dias e
volta. Cinquenta cobre a anamnese inteira (uns 25 turnos) ou alguns dias de chat livre,
e dá uma tela de tamanho previsível.

São as **últimas** cinquenta, devolvidas em ordem cronológica — a pessoa lê de cima para
baixo e a última linha é a mais recente, como em qualquer conversa.

### Sob clique, não automático — DECIDIDO pelo dono do projeto

A tela abre limpa, com um botão discreto acima da conversa. A conversa anterior só é
buscada quando a pessoa pede.

O que decidiu foi o computador emprestado: a sessão dura seis horas e o token vive no
`localStorage`, então quem abre a aba de novo pode não ser quem conversou. Carregar
sozinho poria semanas de conversa sobre saúde na tela sem ninguém ter pedido.

Custo assumido: um clique a mais, e a tela vazia continua parecendo vazia até ele
acontecer. Mitigação barata — o botão diz o que faz (*"ver conversa anterior"*), então
a tela deixa de sugerir que algo se perdeu.

A opção recusada era carregar sozinho, que é o que faz um chat parecer um chat.

### O botão some depois de usado

Carregada uma vez, a conversa fica na tela e o botão desaparece. Sem isso ele viraria um
"carregar de novo" que duplica bolhas — e a página não tem estado para deduplicar.

### O transcrito continua fora do navegador

A rota é a fonte; nada de guardar conversa no `localStorage`. O token já é um risco
assumido e tem prazo de seis horas; conversa sobre saúde não teria prazo nenhum.

## Risks / Trade-offs

**Primeira rota do canal web que devolve dado de saúde.** Até aqui a página só recebia o
turno corrente. Mitigação: exige a mesma sessão, devolve só do dono dela, e a identidade
vem da sessão — nunca de campo do corpo ou da URL.

**A conversa antiga é meio-conversa.** O que foi dito pelo assistente antes de
`mensagem_enviada` existir não foi gravado. Quem reabrir uma conversa daquela época verá
só as próprias falas. Não há conserto — só o registro de que foi assim.

**Cinquenta pode ser pouco para quem conversa muito.** O corte é arbitrário por
construção. Se incomodar no piloto, sobe; é um número num lugar só.
