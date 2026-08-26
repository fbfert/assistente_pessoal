## 1. Registrar o que o sistema envia

- [x] 1.1 `TIPOS_INTERACAO.MENSAGEM_ENVIADA` em `src/constants.js`
- [x] 1.2 `schema.sql`: o valor entra no CHECK, para banco novo
- [x] 1.3 `src/db/migracoes.js`: o valor entra na migração de CHECK que já existe,
      com o sentinela de idempotência apontando para ele
- [x] 1.4 Núcleo grava a linha **depois** de `responder()` resolver, com o canal
- [x] 1.5 Vale para os dois caminhos: pergunta de anamnese e resposta de chat livre
- [x] 1.6 Envio que lança não grava nada

## 2. Remédio no chat livre

- [x] 2.1 `temIndicioDeRemedio(texto, remediosConhecidos)`: função pura, conjunto
      fechado de termos mais os nomes já cadastrados da pessoa
- [x] 2.2 Só roda com anamnese concluída, e só quando há indício
- [x] 2.3 Reaproveita `extrairRemedios` — mesmo prompt estrito, mesma Regra 1b
- [x] 2.4 Descarta item sem horário; nome existente atualiza, nome novo cria
- [x] 2.5 Reconcilia o gatilho de remédio nos dois casos
- [x] 2.6 A resposta confirma exatamente o que foi gravado, em texto determinístico —
      não depende de o modelo lembrar de dizer
- [x] 2.7 Falha da extração não impede a resposta normal
- [x] 2.8 `userRepo`: upsert de remédio por nome, e reconciliação do gatilho

## 3. Dúvida é pergunta, não resposta

- [x] 3.1 `FRASES_DE_DUVIDA` congelado em `src/anamnese/questions.js` — igualdade
      exata sobre texto normalizado, nunca prefixo
- [x] 3.2 Cada pergunta ganha `reformulacao`
- [x] 3.3 `stateMachine`: dúvida reformula e mantém o estado, gastando a segunda
      chance de `anamnese_exemplo_pedido`
- [x] 3.4 Dúvida com a segunda chance já gasta é gravada como está e avança
- [x] 3.5 Nada é gravado no campo enquanto a dúvida está sendo tratada

## 4. Correção honesta

- [x] 4.1 Texto do resumo diz que correção fica anotada para a equipe
- [x] 4.2 Painel: correções reportadas em destaque, com link para o participante

## 5. Testes

- [x] 5.1 Resposta do sistema aparece no histórico, com canal
- [x] 5.2 Pergunta de anamnese enviada também aparece
- [x] 5.3 Envio que falha não grava linha
- [x] 5.4 "considere 23 horas pro bup" grava o horário e confirma na resposta
- [x] 5.5 Menção sem horário não grava nada
- [x] 5.6 Remédio existente é atualizado, não duplicado, e o gatilho acompanha
- [x] 5.7 Mensagem sem indício de remédio não chama o extrator
- [x] 5.8 Falha do extrator não impede a resposta
- [x] 5.9 "como assim?" reformula e não grava; a segunda dúvida grava e avança
- [x] 5.10 O caso real: o texto de pessoas-chave do participante 1 não seria gravado
- [x] 5.11 Migração acrescenta o tipo preservando as linhas, e é idempotente

## 6. Fechamento

- [x] 6.1 `openspec validate --all` e suíte inteira
- [x] 6.2 Verificar rodando, e conferir o histórico dos dois lados
- [x] 6.3 README: o que o chat livre passa a saber gravar
- [x] 6.4 Sync, archive e commit local
