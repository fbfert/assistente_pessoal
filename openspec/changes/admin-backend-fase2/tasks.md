> **Decisões tomadas** (ver `design.md`): consentimento antigo continua válido, sem
> fluxo de re-consentimento; buffer de debounce em memória, com a perda em reinício
> documentada; teste de IA limitado a 20 por administrador e hora, com o teto
> configurável. Nada está bloqueado.

## 1. Schema e repositórios

- [ ] 1.1 Tabelas `config_global` e `config_historico`
- [ ] 1.2 Tabelas `prompts_versionados` e `prompts_historico`
- [ ] 1.3 Reconfirmar o estado do banco antes de recriar — e recriar
- [ ] 1.4 `src/db/configRepo.js`: ler, gravar, listar histórico, reverter
- [ ] 1.5 `src/db/conteudoRepo.js`: idem, para texto longo
- [ ] 1.6 Semente na primeira leitura, a partir da constante do código
- [ ] 1.7 Restaurar padrão de fábrica volta à constante, não à linha mais antiga
- [ ] 1.8 Cache com validação por `MAX(atualizado_em)` — o bot e o admin são
      processos separados, e cache invalidado só na escrita deixaria o bot com o
      texto velho

## 2. Config viva ligada ao app

- [ ] 2.1 `config.js` com a ordem de três degraus: banco, ambiente, constante
- [ ] 2.2 Comentar a mudança no arquivo, que hoje é explícito sobre "nenhum módulo
      acessa process.env diretamente"
- [ ] 2.3 Chaves: janela de resposta, limiar de silêncio, horários padrão,
      `DEBOUNCE_SEGUNDOS`, `TESTE_IA_LIMITE_HORA` — o provedor ativo NÃO entra
      aqui: é da tela de credenciais (`conexao-llm`, decisão (f))
- [ ] 2.4 Validação por tipo: faixa numérica e formato de horário
- [ ] 2.5 Chave de API recusada — nunca aceita nem exibida
- [ ] 2.6 Histórico e auditoria em toda gravação e reversão
- [ ] 2.7 Testes: os três degraus de leitura, validação recusando, histórico,
      reversão gerando linha nova sem apagar as anteriores

## 3. Conteúdo versionado

- [ ] 3.1 Chaves: núcleo, três variantes, três mensagens de gatilho, uma por
      pergunta da anamnese, texto de consentimento
- [ ] 3.2 `prompts.js`, `messages.js` e `questions.js` lendo do banco
- [ ] 3.3 Fallback para a constante — nunca system prompt sem núcleo
- [ ] 3.4 Confirmação reforçada do núcleo: palavra digitada em segunda etapa
- [ ] 3.5 Recusar núcleo vazio
- [ ] 3.6 Testes: semente idêntica ao código de hoje, edição alcançando o bot,
      confirmação reforçada sendo exigida, reversão
- [ ] 3.7 A verificação determinística de medicação (`src/conversa/seguranca.js`)
      NÃO entra no conteúdo versionado — teste que falha se virar chave editável, e
      que o bloqueio continua de pé com o núcleo fixo esvaziado

## 4. Tela de Gatilhos

- [ ] 4.1 Os três tipos com horário padrão, mensagem e contagem de ativos
- [ ] 4.2 Edição de horário e mensagem na própria tela
- [ ] 4.3 Pré-visualização do texto final antes de salvar
- [ ] 4.4 Nota explícita de que o padrão não retroage
- [ ] 4.5 Tabela por participante, leitura, com link para o detalhe — sem duplicar
      o formulário que já existe lá
- [ ] 4.6 Testes: contagem batendo com o banco, padrão não retroagindo, link válido

## 5. Tela de IA / Persona

- [ ] 5.1 Núcleo e três variantes numa tela; provedor ativo em leitura, com link
      para `/credenciais`, que é quem o edita
- [ ] 5.2 Confirmação reforçada valendo também por este caminho
- [ ] 5.3 Teste de mensagem: contexto fictício, rascunho não salvo, resposta na tela
- [ ] 5.4 Limite de 20 por administrador/hora, teto vindo da configuração viva;
      zero desliga; ao recusar, não chama o provedor
- [ ] 5.5 Falha do provedor exibida sem derrubar a página
- [ ] 5.6 Testes: LLM mockado, zero rastro em `historico_interacoes`, confirmação
      reforçada exigida

## 6. Consentimento versionado

- [ ] 6.1 Esquema de versão e incremento automático a cada edição
- [ ] 6.2 Sem caminho de salvar o texto mantendo a versão
- [ ] 6.3 Versão aceita visível na página do participante, com marca de desatualizada
- [ ] 6.4 **Sem** fluxo de re-consentimento: documentar no README que
      consentimentos antigos seguem válidos, e a condição em que a decisão precisa
      ser revista (edição que mude o tratamento do dado, não só a redação)
- [ ] 6.5 Testes: incremento a cada edição, versão vigente para quem chega novo,
      marca de versão anterior na página do participante

## 7. Debounce

- [ ] 7.1 `src/whatsapp/debounce.js` com buffer por participante — no ADAPTADOR do
      WhatsApp, não no núcleo: é comportamento de transporte, como a transcrição
- [ ] 7.2 Zero significa processar na hora; é o padrão
- [ ] 7.3 Só para anamnese concluída — a anamnese não passa pelo buffer
- [ ] 7.7 O canal web NÃO passa pelo buffer: a rota é requisição-resposta, e o
      cliente já serializa os envios. Teste que falha se o núcleo ganhar o agrupamento
- [ ] 7.4 Áudio transcrito e incorporado na ordem de chegada
- [ ] 7.5 **Sem** persistência: documentar no README que mensagens em buffer se
      perdem se o bot reiniciar dentro da janela
- [ ] 7.6 Testes com timers controlados, sem esperar segundos de verdade

## 8. Fechamento

- [ ] 8.1 README: telas novas, config editável, custo real do teste de mensagem,
      e que a chave de API continua só no ambiente
- [ ] 8.2 `.env.example`: variáveis que migraram para a configuração viva
- [ ] 8.3 `openspec validate --all` e suíte inteira
- [ ] 8.4 Verificar rodando no Docker, pelo domínio
- [ ] 8.5 Sync, archive e commit local
