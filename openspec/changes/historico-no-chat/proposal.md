## Why

O piloto vai começar **pelo canal web**, e não pelo WhatsApp. Isso muda o peso de uma
limitação que era aceitável enquanto a web era plano B: **quem fecha e reabre a aba vê
uma tela vazia.**

A conversa não se perdeu — está no servidor, e o assistente continua sabendo de tudo
pelo contexto. Mas a pessoa não vê nada do que disse. Para quem vai usar isto por duas
ou três semanas como canal principal, reabrir a aba é rotina, e uma tela em branco
depois de uma conversa sobre a própria saúde parece perda de dado.

Hoje não existe rota que devolva a conversa: `/web/mensagem` só devolve a resposta do
turno, e nada mais no canal web lê histórico.

## What Changes

- **`GET /web/historico`**, autenticada pela sessão, devolvendo as **últimas 50
  mensagens** daquele participante — as dele e as do assistente, em ordem.
- **Botão "ver conversa anterior"** na página, acima da conversa. A tela abre limpa; a
  conversa só aparece quando a pessoa pede.
- A rota devolve **apenas mensagem de conversa**. Registro interno — entrada no canal,
  ação do operador, aprendizado de perfil e, sobretudo, **resposta bloqueada por
  segurança** — nunca sai por ela.

## Capabilities

### Modified Capabilities

- `canal-web`: a rota de histórico e o botão que a aciona.

## Impact

- **Código:** `src/web/servidor.js`, `src/web/publico/{index.html,app.js,estilo.css}`,
  `src/db/interactionLog.js`, `test/`.
- **Schema:** nenhum. A tabela já tem tudo — inclusive o lado do assistente, desde que
  `mensagem_enviada` passou a existir.
- **Dado exposto:** é a primeira rota do canal web que **devolve** conversa com dado de
  saúde. Até aqui a página só recebia o turno corrente. Ver o design.
- **Limitação herdada:** conversa anterior a `mensagem_enviada` só tem o lado da pessoa.
  As respostas do assistente daquela época não foram gravadas e não há como recuperá-las.
- **Fora de escopo:** paginação para trás, busca no histórico, e exportação. Cinquenta
  mensagens é o que a tela mostra; o resto é o admin.
