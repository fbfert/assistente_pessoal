## Context

Quatro defeitos vindos da **primeira sessão real** do piloto (26/08, canal web, 25
minutos, participante `Polentoso`). Nenhum deles apareceu nos 284 testes, porque
todos os quatro são sobre o que o sistema **não faz** — e teste que ninguém escreveu
não falha.

O que já existe e delimita o desenho:

- `src/conversa/nucleo.js` registra a mensagem recebida e envia a resposta por
  `responder(texto)` — sem gravar nada do que saiu.
- `extrairRemedios(texto, deps)` é chamado só no estado 6, pelo plano da máquina de
  estados. É prompt estrito, parse defensivo, e nunca inventa horário.
- `anamnese_exemplo_pedido` é o flag de **uma** segunda chance por estado, zerado a
  cada transição. Serve hoje para resposta vaga e para a repergunta de personalidade.
- A comparação de resposta do usuário é **igualdade exata contra `Set` fechado**,
  nunca regex de prefixo (AGENTS §4 — bug real já pago).
- O painel já agrega `correcoesReportadas`, mas as exibe sem destaque e sem link.

## Goals / Non-Goals

**Goals:**

- O histórico do participante contar os dois lados da conversa.
- A pessoa conseguir corrigir o horário do próprio remédio conversando.
- O sistema nunca confirmar o que não fez.
- Pergunta de volta ser tratada como pergunta.

**Non-Goals:**

- O modelo reescrever campo de perfil a partir de texto livre.
- Reperguntar campo já respondido (a máquina de estados só avança).
- Registrar mensagem de gatilho de novo — `gatilho_disparado` já cobre.
- Extrair qualquer outra coisa do chat livre. Só remédio, e só com horário.

## Decisions

### `mensagem_enviada`: um tipo, os dois lados

Tipo novo no CHECK, não reaproveitamento. Os tipos existentes descrevem o que a
**pessoa** fez (`resposta_gatilho`, `despejo_espontaneo`) ou um evento do sistema
sobre ela (`gatilho_disparado`, `acao_admin`). Falta o que o sistema **respondeu**.

`mensagem_enviada`, e não `resposta_bot`: cobre também as perguntas da anamnese, que
não são resposta a nada. E não colide de leitura com `resposta_gatilho`, que é a
resposta *da pessoa* a um gatilho — dois "resposta" com donos diferentes na mesma
lista seria convite a erro.

Grava-se **depois** do envio bem-sucedido. Registrar antes produziria histórico de
mensagem que nunca chegou; e se o envio falhar, a ausência da linha é a informação
correta.

Disparo de gatilho continua sendo só `gatilho_disparado` — ele já registra o texto
enviado, e duplicar criaria duas linhas para o mesmo evento.

### Remédio no chat livre: só com horário, e o bot diz o que gravou

O caminho é o mesmo `extrairRemedios`, com o mesmo prompt estrito. O que muda é
**quando** ele roda e **o que é aceito**:

1. Roda apenas para participante com anamnese concluída, e apenas quando o texto tem
   indício de medicação. Sem isso, seria mais uma chamada de LLM em toda mensagem.
2. **Só grava item que vier com horário.** Nome sem horário é descartado: sem horário
   não há gatilho, então gravar não mudaria nada e ainda poderia criar remédio
   duplicado a partir de uma menção de passagem.
3. Nome que já existe para aquela pessoa tem o **horário atualizado**; nome novo cria
   remédio. Nos dois casos o gatilho de remédio é reconciliado.
4. O assistente **confirma em voz alta** o que foi gravado. É o que fecha o buraco
   original: a pessoa saber que o pedido dela virou registro.
5. Cada gravação vira linha de auditoria no histórico dela.

**O risco assumido, dito com todas as letras:** isto é escrita de dado de saúde a
partir de conversa livre, não de pergunta dirigida. "Meu pai toma ritalina às 8"
poderia virar remédio dela. As mitigações são o prompt estrito (que já existe e já
é testado), a exigência de horário, a confirmação em voz alta — que dá à pessoa a
chance de dizer "não é meu" — e a auditoria, que dá ao operador como desfazer.

A alternativa considerada e recusada: o bot declarar que não sabe salvar remédio fora
da anamnese. Zero risco, e deixa a pessoa sem conseguir corrigir o próprio horário —
que é o problema que abriu esta mudança.

### Dúvida é pergunta, não resposta

Conjunto **fechado** de frases de dúvida, comparado por igualdade exata depois de
normalizar — nunca regex de prefixo, pela mesma razão registrada no AGENTS §4.

Ao bater, o sistema **reformula a pergunta** e mantém o estado, gastando a mesma
segunda chance de `anamnese_exemplo_pedido` que a resposta vaga já usa. Segunda
dúvida seguida é gravada como está e avança — pela mesma razão da tolerância a
resposta vaga: travar a pessoa tentando arrancar qualidade perde a pessoa.

Cada pergunta ganha um texto de reformulação próprio, ao lado do texto original. Um
"deixa eu explicar melhor" genérico não explicaria nada.

### Correção no resumo: dizer a verdade

A decisão de **não** deixar o modelo reescrever campo de perfil continua valendo, e
por isso mesmo o texto do resumo precisa parar de sugerir o contrário. Passa a dizer
que o que for apontado fica anotado para a equipe ajustar.

O painel já lista as correções reportadas; ganha destaque e link direto para a página
do participante — o que transforma a anotação em algo que alguém realmente vê.

## Risks / Trade-offs

**Escrita de dado de saúde a partir de conversa livre.** É o risco central desta
mudança, e nenhuma das mitigações o elimina. O que elas fazem é tornar o erro
visível: a pessoa ouve o que foi gravado, e o operador tem a linha de auditoria.

**Histórico dobra de tamanho.** Cada turno passa a gravar duas linhas. É o custo de
tornar o piloto auditável, e na escala dele não é custo nenhum.

**Mais uma chamada de LLM quando há indício de remédio.** A heurística que decide se
há indício vai errar para os dois lados: chamar à toa às vezes, e deixar passar uma
menção esquisita. Errar para o lado de chamar é barato; o outro lado mantém o
comportamento de hoje.

**O conjunto de frases de dúvida é fechado e vai estar incompleto.** Alguém vai
escrever "hã?" de um jeito que não está na lista e ter a dúvida gravada como resposta.
Ampliar a lista é barato; abrir para heurística é que não — foi assim que o bug do
consentimento nasceu.
