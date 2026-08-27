## 1. Rota

- [ ] 1.1 `listarConversa(usuarioId, limite)` em `src/db/interactionLog.js`: últimas N
      linhas, filtradas por lista FECHADA de tipos permitidos, devolvidas em ordem
      cronológica
- [ ] 1.2 A lista permitida cobre os dois lados: mensagens da pessoa (anamnese, resposta
      de gatilho, despejo espontâneo, correção reportada) e do sistema (mensagem
      enviada, gatilho disparado)
- [ ] 1.3 `GET /web/historico` em `src/web/servidor.js`, exigindo sessão, identidade
      vinda dela
- [ ] 1.4 Devolve `{ mensagens: [{ de, texto, quando }] }` — nada de tipo interno
      vazando na forma
- [ ] 1.5 Limite de 50 como constante nomeada, num lugar só

## 2. Página

- [ ] 2.1 Botão "ver conversa anterior" acima da conversa, visível ao abrir com sessão
- [ ] 2.2 Ao acionar: busca, desenha acima do que já estiver na tela, e some
- [ ] 2.3 Falha da busca não quebra a tela: avisa e mantém o botão
- [ ] 2.4 Texto continua entrando por `textContent`
- [ ] 2.5 Nada é guardado no navegador além do token

## 3. Testes

- [ ] 3.1 Devolve as mensagens dos dois lados, em ordem
- [ ] 3.2 Respeita o limite de 50, devolvendo as MAIS RECENTES
- [ ] 3.3 **Resposta bloqueada por segurança nunca aparece** — o teste grava uma e
      confere
- [ ] 3.4 Entrada no canal, ação de admin e nota de aprendizado não aparecem
- [ ] 3.5 Sem token, com token inválido e com token expirado: recusado
- [ ] 3.6 Identificador no corpo ou na URL não troca o participante
- [ ] 3.7 A página abre sem a conversa e com o botão; o botão some depois de usado
- [ ] 3.8 O cliente não guarda conversa no navegador

## 4. Fechamento

- [ ] 4.1 README: como a pessoa recupera a conversa, e que são as últimas 50
- [ ] 4.2 `openspec validate --all` e suíte inteira
- [ ] 4.3 Verificar rodando, pelo domínio
- [ ] 4.4 Sync, archive e commit local
