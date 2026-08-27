## Why

Hoje o assistente responde bem, mas responde **genérico**. A Regra 3 do núcleo
manda focar na "ação mínima seguinte", e o que sai disso é quase sempre a mesma
forma: *"que tal escolher uma coisa pequena e começar por ela?"*. Está correto e
é vazio — não diz **qual** coisa, nem **como**.

Na primeira sessão real do piloto isso apareceu inteiro. A pessoa escreveu
"Estou me sentindo confuso" e recebeu *"Descanse um pouco. Pode ajudar. Alguma
tarefa pequena ajuda a clarear a mente?"*. Depois, "Não sei, o que propõe?" — e
a resposta seguinte foi a que virou a correção de segurança de ontem. O modelo
não tinha nada concreto para oferecer e foi buscar a única coisa específica que
enxergava no contexto: o remédio dela.

**A falta de conteúdo concreto não é só uma resposta morna — é o que empurra o
modelo para os cantos errados.**

O que falta é uma base pequena e curada de técnicas práticas, e um jeito de
achar a certa para o que a pessoa acabou de dizer.

## What Changes

- **Taxonomia fechada de sete temas** do dia a dia executivo, com
  palavras-gatilho: iniciar tarefa, foco e distração, gestão de tempo, ambiente
  e sensorial, sono, energia e fadiga, transição entre atividades.
- **Base de técnicas** — texto curto e aplicável, com fonte registrada, que
  nasce em **rascunho** e só entra em uso depois de aprovada pela tela.
- **Classificação determinística por palavra-chave**, sem chamada de LLM nova:
  mesma filosofia de `classify/heuristic.js`, custo zero por mensagem.
- **No máximo UMA técnica por resposta**, entrando no contexto como sugestão
  opcional — a base enriquece **qual** coisa sugerir, não quantas.
- **Rodízio**: sai a técnica menos sugerida recentemente, para a mesma frase não
  aparecer três dias seguidos.
- **Tela de curadoria** no admin: temas, técnicas, publicar, arquivar.

## Capabilities

### New Capabilities

- `base-tecnicas`: a taxonomia, o ciclo de curadoria da técnica, a classificação
  por palavra-chave e a regra de no máximo uma por resposta.

### Modified Capabilities

- `nucleo-conversa`: a técnica escolhida entra no contexto da chamada de resposta.
- `persona`: adendo à Regra 3, delimitando o que a técnica pode e não pode ser.
- `armazenamento`: tabelas de tema e técnica, e o tipo `tecnica_sugerida`.
- `dashboard-piloto`: a tela de curadoria entra na navegação.

## Impact

- **Código:** `src/conhecimento/` (novo), `src/conversa/nucleo.js`,
  `src/llm/prompts.js`, `src/db/{schema.sql,migracoes.js}`, `src/constants.js`,
  `src/dashboard/rotas/tecnicas.js` (novo), `test/`.
- **Dependências:** nenhuma. A busca é por palavra-chave em SQLite; sem
  embeddings, sem serviço externo, sem custo de API novo.
- **Schema:** duas tabelas novas (entram sozinhas) e um valor novo no CHECK de
  `historico_interacoes` — migração pelo procedimento já usado quatro vezes.
- **Custo por mensagem:** **zero**. A classificação é determinística e a busca é
  local. Diferente do aprendizado contínuo, que paga uma chamada a mais.
- **Volume de histórico:** uma linha a mais nas mensagens que batem um tema.
- **Conteúdo real é responsabilidade de quem cura.** Esta mudança entrega o
  mecanismo e, no máximo, duas técnicas de EXEMPLO por tema, em rascunho,
  marcadas como tal. Nenhuma publicada.
- **Fora de escopo, explicitamente:** busca semântica ou embeddings; geração
  automática de técnica pelo LLM; e qualquer conteúdo psicoeducativo ou clínico
  sobre TDAH e autismo.
