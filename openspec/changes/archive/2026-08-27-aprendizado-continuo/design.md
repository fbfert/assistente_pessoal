## Context

> **Revisão de arquitetura.** Este documento foi escrito quando o processamento de
> mensagem morava em `processarMensagemNormal`, dentro de `src/whatsapp/handler.js`.
> Isso mudou: a mudança `canal-web`, já arquivada, extraiu o núcleo canal-agnóstico
> para `src/conversa/nucleo.js`. As seções abaixo foram refeitas sobre o código de
> hoje; as decisões (a), (b) e (c) no fim continuam valendo sem alteração.

O que existe hoje e delimita o desenho:

- `src/conversa/nucleo.js` é o **único** caminho de decisão dos dois canais.
  `processarMensagem({ usuario, texto, canal, responder }, deps)` recebe a pessoa já
  identificada e uma função de envio sem endereço; `conversaLivre` é a parte que trata
  chat livre.
- **`conversaLivre` já executa duas chamadas de LLM em paralelo**, num `Promise.all`:
  a resposta e a extração de remédio dito na conversa. A extração de aprendizado entra
  como a **terceira promessa do mesmo `Promise.all`** — não é padrão novo, é o padrão
  que já está lá.
- `src/conversa/seguranca.js` (`instruiSobreMedicacao`) roda **depois** das chamadas e
  **antes** do envio: varre a saída do modelo e bloqueia instrução de medicação. Esta
  mudança **não toca nisso** e não conflita: o mecanismo de aprendizado não envia
  mensagem nenhuma, então nunca cruza essa verificação. São coisas diferentes com nomes
  parecidos — uma vigia o que sai, a outra lê o que entra.
- `montarSystemPrompt(usuario, remedios)` é chamado dentro de `conversaLivre`;
  `montarContextoAnamnese(usuario, remedios)` em `src/llm/prompts.js` continua função
  pura, sem banco.
- `extrairRemedios(texto, deps)` em `src/anamnese/extrairRemedios.js` é o padrão já
  testado de extração por LLM: prompt estrito, `chamar` injetável, parse defensivo que
  devolve `[]` em vez de lançar. É esse padrão que se reaproveita aqui.
- `CAMPOS_ANAMNESE` em `src/db/userRepo.js` é a whitelist fechada de campos — existe
  porque o nome do campo vira nome de coluna na query.
- A auditoria tem dois destinos: `historico_interacoes` com `tipo='acao_admin'` para
  ação do operador sobre participante, e `auditoria_admin` para ação sobre a equipe.
- `confirmacao()` em `src/dashboard/rotas/acoes.js` é a confirmação de duas etapas:
  GET descreve, POST executa.
- `src/db/migracoes.js` já implementa a migração de CHECK completa, e já foi usada três
  vezes. O sentinela de idempotência aponta sempre para o valor mais novo da lista.

### Colisão com as mudanças ativas

**`admin-backend-fase2` — `0/49 tasks`, nada implementado.** Conferido de novo agora, e
o resultado não mudou:

| O que a Fase 2 muda | Colide? |
|---|---|
| `NUCLEO_FIXO` e `VARIANTES` passam a vir do conteúdo versionado | **Não.** São outras partes do system prompt; o contexto da anamnese continua vindo dos parâmetros. |
| Texto de `PERGUNTAS` e `TEXTO_CONSENTIMENTO` vem do banco | **Não.** Esta mudança não toca `src/anamnese/questions.js`. |
| Debounce antes do núcleo | **Não — compõe.** O buffer agrupa e entrega texto concatenado; a extração vive *dentro* de `conversaLivre` e passa a ver o texto já agrupado, que é o comportamento desejado: extrair da rajada inteira, não de cada fragmento. |
| `config_global` / ordem de leitura em três degraus | **Não.** Nenhuma chave nova de configuração aqui. |

**A interface mínima que funciona nas duas ordens de implementação é aditiva:**
`montarContextoAnamnese(usuario, remedios, notas = [])` e
`montarSystemPrompt(usuario, remedios, notas = [])`. Terceiro parâmetro posicional, com
valor padrão. Se a Fase 2 chegar primeiro e trocar a origem do núcleo fixo, o terceiro
parâmetro continua válido; se esta chegar primeiro, a Fase 2 mexe em outra parte da
mesma função sem tocar na assinatura. Nenhuma das duas precisa esperar a outra.

Vale para a chamada também: hoje `conversaLivre` faz `montarSystemPrompt(usuario,
remedios)`; passa a fazer `montarSystemPrompt(usuario, remedios, notas)`. Uma linha, no
único lugar onde o prompt é montado para conversa.

**`conexao-llm` — arquivada e implantada.** Nenhuma colisão: ela resolveu de onde vem
a credencial. Esta mudança usa `chamarLLM` como está, e herda a chave e o modelo que
estiverem valendo.

## Goals / Non-Goals

**Goals:**

- O perfil acumula depois do dia 1, sem pergunta extra à pessoa.
- Nada do que a pessoa respondeu sob consentimento formal é sobrescrito.
- Aprendizado errado é visível e removível pelo operador, sem SQL.
- Nenhuma latência nova no chat livre.

**Non-Goals:**

- Remédio, dose e horário — continuam só por `extrairRemedios`.
- Nome — é identidade, não traço de perfil.
- Edição do texto de uma nota pelo admin (só remoção; a nota é registro do que foi
  captado, não campo de formulário).
- Consolidação automática de notas parecidas, resumo periódico, ou reescrita da
  resposta original da anamnese a partir das notas.
- Aprender durante a anamnese — lá o fluxo já é pergunta-resposta dirigida.

## Decisions

### Tabela separada, nunca sobrescrever o campo da anamnese

O que a pessoa respondeu no dia 1, sob consentimento formal, é fato datado e
imutável. O que se aprende depois é outra coisa: inferência de conversa, sem
consentimento específico para aquele item, e sem a mesma confiabilidade.

Empilhar em vez de substituir é o mesmo princípio append-only de
`historico_interacoes`. E é o que torna possível responder "isso ela disse na
anamnese ou o bot deduziu?" — pergunta que, com sobrescrita, não teria resposta.

### Campos elegíveis: `CAMPOS_ANAMNESE` menos `nome`

`CAMPOS_ANAMNESE` já é a whitelist fechada; a lista de campos aprendíveis é derivada
dela, não redigitada — duas listas independentes divergem no primeiro campo novo.

`nome` sai porque é identidade, não traço: o bot "aprender" um nome diferente do que
a pessoa pediu para ser chamada seria regressão, não aprendizado.

Remédio **não está** em `CAMPOS_ANAMNESE` (vive em tabela própria), então não entra
pela derivação. Mas a exclusão é explícita em três lugares — na constante, no prompt
de extração e no CHECK da coluna `campo` — porque o risco não é o campo entrar por
engano na lista: é o LLM devolver conteúdo de remédio rotulado como outro campo.
Registrar "ela toma ritalina de manhã" em `rotina_boa` burlaria o mecanismo de
Regra 1b por fora, e o CHECK da coluna não pegaria isso. Quem pega é o prompt, e por
isso a instrução é literal e o teste é dedicado.

### Extração conservadora: padrão recorrente, não queixa pontual

O risco aqui não é o mesmo da Regra 1b, e por isso não se resolve com o mesmo
remédio. Lá o perigo é **inventar** dado que não foi dito. Aqui é **generalizar**
dado que foi dito: transformar "hoje o trânsito me deixou louco" num traço permanente
de perfil ("gatilho de sobrecarga: trânsito"). O parentesco com Stone et al. 2002 é
o mesmo de fundo — produzir dado que parece confiável e não é.

O prompt exige três coisas juntas para capturar: a pessoa falou **de si mesma**, a
frase descreve algo **geral ou recorrente** (não um episódio de hoje), e é **novo**
frente ao perfil já conhecido. Na dúvida, não captura. Perder uma nota é recuperável
— a pessoa repete, ou o operador anota à mão. Um traço falso no perfil se propaga
silenciosamente para toda mensagem seguinte.

### Em paralelo com a resposta — DECIDIDO pelo dono do projeto

Ver "Decisões do dono do projeto", item (a). As duas chamadas disparam juntas; a
resposta não espera a extração. A nota entra no contexto da mensagem **seguinte**.

Consequência técnica: a extração não pode ser um `await` no caminho da resposta, e
sua falha não pode rejeitar a promessa que o handler devolve. A gravação da nota e a
linha de auditoria acontecem quando a extração terminar, independentemente do que a
resposta fez. O handler continua devolvendo o mesmo objeto de retorno de hoje.

### Um destino para cada auditoria — DECIDIDO pelo dono do projeto

Ver item (c). Criação de nota é evento do bot: tipo novo `aprendizado_perfil`.
Remoção é escrita do operador sobre um participante: `acao_admin`, o tipo que já
existe, pelo helper `auditar()` que já nomeia o autor.

A linha de auditoria carrega **o campo e o texto da nota** — nunca a mensagem de
origem inteira, que pode conter outro dado sensível não relacionado ao que foi
aprendido. A rastreabilidade até a mensagem se faz pela coluna `interacao_id`, que
aponta para a linha do histórico, em vez de copiar o texto dela. Copiar criaria uma
segunda cópia do dado sensível, que a anonimização teria que lembrar de redigir nos
dois lugares.

### Soft delete com `removido_em` e `removido_por`, não um booleano

O enunciado pedia um campo `removido`. Um booleano responde "está removida?" e nada
mais. `removido_em TEXT NULL` responde a mesma pergunta com o mesmo custo (`IS NULL`
no filtro) e ainda diz **quando**; `removido_por` diz **quem**, referenciando
`admin_usuarios` sem `ON DELETE`, como o resto do projeto — conta se desativa, nunca
se apaga.

### Migração do CHECK: a primeira que não pode recriar o volume

Adicionar `aprendizado_perfil` ao CHECK de `historico_interacoes` é exatamente o caso
da §6 do AGENTS.md. `CREATE TABLE IF NOT EXISTS` não altera tabela existente, e
`ALTER TABLE` do SQLite não mexe em CHECK. Recriar o volume deixou de ser opção assim
que o WhatsApp for pareado: `/data/auth` vive no mesmo volume, e reparear exige o
chip em mãos.

O procedimento, em `src/db/migracoes.js`, chamado por `abrirDb` logo após o
`schema.sql`:

1. **Contar as linhas antes.** Na hora, não confiando em verificação de sessão
   anterior.
2. `PRAGMA foreign_keys = OFF` — **fora** da transação; o SQLite ignora essa mudança
   dentro de uma. Sem ela, o `DROP` da tabela antiga dispara CASCADE nas filhas.
3. Dentro da transação: criar `historico_interacoes_novo` com o CHECK atualizado,
   `INSERT INTO ... SELECT` de tudo, `DROP` da antiga, `ALTER TABLE ... RENAME`.
4. Recriar o índice composto, que morre junto com a tabela.
5. **Contar as linhas depois** e abortar se divergir.
6. `PRAGMA foreign_keys = ON`.

Idempotência por inspeção de `sqlite_master`: se o texto da constraint já contém o
tipo novo, a migração não roda. É o que permite chamá-la a cada abertura sem custo
e sem tabela de controle de versão de schema — que seria a solução certa para um
projeto com dezenas de migrações e é peso morto para o primeiro.

### A tabela nova não precisa de migração

`notas_aprendidas` entra por `CREATE TABLE IF NOT EXISTS` no `schema.sql`, que roda a
cada abertura. Banco existente ganha a tabela na próxima subida. Só a constraint
alterada exige o procedimento acima.

### Reiniciar anamnese apaga as notas; anonimizar as redige

São ações com propósitos opostos e o tratamento acompanha:

- **Reiniciar** existe para a pessoa responder tudo de novo. Notas construídas sobre
  o perfil velho contaminariam o novo. Vão junto com remédios, gatilhos e contadores,
  com `DELETE` de verdade — como os remédios já vão hoje. O rastro do que existiu
  continua nas linhas de `historico_interacoes`, que ninguém apaga.
- **Anonimizar** existe para a pessoa sair do piloto sem destruir a prova de
  auditoria. `notas_aprendidas.texto` guarda conteúdo escrito pela própria pessoa —
  entra na mesma redação por `REDIGIDO` que já cobre os campos de anamnese, os
  remédios e o texto das interações. Redigir tudo menos as notas seria fachada.

## Risks / Trade-offs

**O extrator grava sem revisão humana prévia.** É a diferença real frente a
`extrairRemedios`, que roda uma vez, num estado dirigido da anamnese, sobre uma
resposta a uma pergunta específica. Aqui roda sobre conversa livre, todo dia.
Mitigação: critério conservador, visibilidade no admin, remoção em um clique.
Nenhuma delas impede a captura errada — encurtam o tempo até desfazê-la.

**Custo por mensagem, não por evento.** A chamada acontece a cada mensagem de chat
livre, aprendendo algo ou não; a maioria não vai aprender nada. Dobrar o número de
chamadas para capturar o caso minoritário é o preço aceito, e a alternativa —
heurística local decidindo quando vale chamar o LLM — seria mais um classificador
para calibrar antes do piloto começar.

**Contexto que cresce sem poda.** Nada limita quantas notas um campo acumula. Em 2 a
3 semanas com 5 pessoas não chega perto de incomodar o system prompt; num piloto
longo, é o primeiro lugar a revisar. Registrado, não resolvido.

**Uma migração de CHECK sobre banco possivelmente pareado.** O procedimento é o
documentado, com contagem antes e depois — mas é a primeira vez que este projeto
recria uma tabela com dado real dentro.

---

## Decisões do dono do projeto

As três perguntas abaixo foram levantadas e **respondidas**. Ficam registradas com as
opções que estavam na mesa, para que a escolha continue legível depois.

### (a) Reconhecimento no mesmo turno: série ou paralelo

**DECIDIDO: em paralelo.** As duas chamadas de LLM disparam ao mesmo tempo e o envio
da resposta não espera a extração. O reconhecimento não aparece no mesmo texto que
responde a mensagem que ensinou algo — aparece a partir da próxima, dentro da mesma
conversa.

A tensão era real: "reconhecimento leve no mesmo turno" e "sem atrito no chat livre"
não cabem juntas. O que decidiu foi a regra de ouro do input mínimo: é a resposta
rápida que segura alguém com TDAH esperando no WhatsApp, não o reconhecimento
instantâneo.

Opções que estavam na mesa:

**Opção 1 — em paralelo.** ← escolhida Resposta na velocidade de hoje; contexto
enriquecido para qualquer mensagem seguinte da mesma sessão de papo. Custo: a frase
imediatamente seguinte à que ensinou não reconhece nada.

**Opção 2 — em série, mesmo turno.** A extração roda primeiro e o resultado entra no
prompt da resposta, que reconhece no mesmo texto. Cumpre o enunciado à risca, e cobra
a latência de duas chamadas em série em **toda** mensagem de chat livre — inclusive
nas que não aprendem nada, que são a maioria.

### (b) Nome do tipo novo em `historico_interacoes`

**DECIDIDO: `aprendizado_perfil`.** Nomeia o evento, não o artefato — coerente com
`acao_admin` e `correcao_reportada`, que também nomeiam o que aconteceu. O histórico
é lido por gente, em ordem cronológica, como sequência de eventos.

Opções que estavam na mesa: `nota_aprendida` (casa com o nome da tabela, mas nomeia o
objeto e não o evento) e `perfil_atualizado` (mais genérico, serviria a outros
caminhos futuros — e deixaria de distinguir o que o bot aprendeu sozinho do que o
operador editou à mão).

### (c) Onde vai a auditoria de criação e de remoção

**DECIDIDO: criação com o tipo novo, remoção como `acao_admin`.** Os dois eventos vão
para `historico_interacoes` com `usuario_id` — são fatos da linha do tempo daquela
pessoa, e é lá que quem abre a página dela espera encontrá-los.

A divisão segue quem agiu: o bot aprendendo é evento novo do sistema; o operador
removendo é escrita de admin sobre participante, exatamente o que `acao_admin` já
cobre, com o helper que já nomeia o autor. Reaproveita o padrão em vez de duplicá-lo.

Opções que estavam na mesa: ambas no tipo novo (agruparia o mecanismo sob um rótulo
só, e tiraria a remoção de perto das outras ações do operador) e ambas em
`auditoria_admin` (descartada: aquela tabela não tem coluna de participante, e o bot
aprendendo não é ação de equipe — a nota sumiria da linha do tempo da pessoa).
