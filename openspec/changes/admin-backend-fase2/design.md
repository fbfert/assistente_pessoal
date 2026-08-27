## Context

Os itens 1 e 2 do escopo já estão em produção, entregues por mudanças anteriores:
login por e-mail e senha com contas em `admin_usuarios`, hash `scrypt`, bootstrap
por ambiente, troca da própria senha, CRUD com senha temporária, reset como
recuperação, e auditoria de equipe em `auditoria_admin`. Esta mudança não os
redesenha.

O que existe de relevante para o que vem agora:

- `src/config.js` é explícito: "nenhum módulo acessa `process.env` diretamente".
- `SEM_INFORMACAO`, `HORARIO_PADRAO_CHECKIN` e `HORARIO_PADRAO_CHECKLIST` são
  constantes exportadas de `src/constants.js`.
- `NUCLEO_FIXO`, `VARIANTES` e `PERSONALIDADES` são constantes em
  `src/llm/prompts.js`; `PERGUNTAS` e `TEXTO_CONSENTIMENTO` em
  `src/anamnese/questions.js`; as mensagens em `src/triggers/messages.js`.
- A confirmação de duas etapas já é padrão: `confirmacao()` em
  `src/dashboard/rotas/acoes.js`, GET descreve e POST executa.
- A auditoria tem dois destinos: `historico_interacoes` com `tipo='acao_admin'`
  para ação sobre participante, e `auditoria_admin` para ação sobre a equipe.

### O que rodou depois desta proposta ser escrita

Cinco mudanças foram implementadas e arquivadas entre a escrita desta proposta e
agora. Três encostam nela:

| Mudança | Efeito sobre esta proposta |
|---|---|
| `conexao-llm` | **Já entregou o provedor ativo**, em `chavesRepo.lerAtivo/escreverAtivo` com tela em `/credenciais`. Ele SAIU do escopo de `config-viva` e da tela de IA, que passa a apenas exibi-lo com link. Duas fontes de verdade para o mesmo botão seria o bug caro. |
| `canal-web` | Extraiu o núcleo canal-agnóstico. O debounce **continua no adaptador do WhatsApp** — ver a decisão abaixo, que agora explica por quê em vez de só onde. |
| `seguranca-instrucao-medicacao` | Acrescentou a **Regra 1c** ao núcleo fixo e uma segunda camada determinística. Muda o cálculo de risco do núcleo editável — ver Risks. |

## Goals / Non-Goals

**Goals:**

- Calibrar o piloto sem deploy.
- Toda mudança de comportamento com autor, data e caminho de volta.
- Testar a persona sem usar participante real como cobaia.
- Reduzir o ruído de três respostas para três mensagens seguidas.

**Non-Goals:**

- Papéis e permissões.
- Chave de API na interface, em qualquer forma.
- Configuração por participante — tudo aqui é global.
- Editor rico, pré-visualização de markdown, diff visual entre versões.

## Decisions

### Correção do enunciado: os horários padrão nunca foram variáveis de ambiente

O item 3 pede que `config.js` leia os horários padrão da tabela "caindo para o
valor do `.env`". Esse fallback não existe:
`HORARIO_PADRAO_CHECKIN`/`HORARIO_PADRAO_CHECKLIST` são **constantes de
`src/constants.js`**, nunca foram lidas do ambiente.

A ordem de leitura fica, então, com três degraus, e não dois:

1. `config_global`, se a chave existir;
2. variável de ambiente, para as chaves que têm uma (`RESPOSTA_GATILHO_JANELA_MIN`,
   `SILENCIOS_ATE_REDUZIR_TOM`);
3. a constante do código, sempre.

Assim nenhuma chave fica sem valor, e o degrau 3 é o que permite `schema.sql`
subir sem semear nada.

### O provedor ativo saiu daqui — foi para a tela de credenciais

**Revisão posterior deste documento.** A versão inicial punha a escolha de
provedor na configuração viva, e o delta `llm-provider` desta mudança dizia isso.
A mudança `conexao-llm`, na decisão (f) do design dela, passou o seletor para a
tela de credenciais: rádio único, gravado no próprio arquivo
`/data/llm-chaves.json` sob a chave `ativo`, resolvido antes de `LLM_PROVIDER`.

Manter os dois seria pior que qualquer um sozinho: duas telas editando o mesmo
botão em fontes de verdade diferentes, e quem mudasse na tela errada não veria
efeito nenhum, sem ter como entender por quê.

O que decidiu foi a coerência do gesto — escolhe-se o provedor no mesmo lugar e no
mesmo momento em que se dá a chave a ele, e é lá que também se testa se ela
funciona. Aqui não havia credencial nenhuma, por decisão explícita desta mudança.

Consequências nesta mudança, todas já aplicadas:

- O delta `llm-provider` **deixou de existir**: as três afirmações dele (provedor
  vindo da config viva, troca valendo sem reinício, chave só no ambiente) passaram
  todas para o delta correspondente da `conexao-llm`.
- `LLM_PROVIDER` saiu da lista de chaves com degrau de ambiente, acima.
- A tela de IA exibe o provedor ativo e **linka** para a de credenciais, em vez de
  editá-lo.
- A configuração viva ficou sem nenhuma chave de opções fechadas — as restantes são
  numéricas e de horário —, então o tipo "escolha" saiu da capability `config-viva`
  junto. Volta quando surgir a primeira chave que o use.

### Duas tabelas de conteúdo, não uma

`config_global` guarda valor curto e tipado (número, horário, escolha).
`prompts_versionados` guarda texto longo. São formatos e validações diferentes: um
valida faixa numérica e formato `HH:MM`, o outro valida presença e tamanho. Forçar
os dois na mesma tabela criaria uma coluna `tipo` que significa coisas
incompatíveis e uma validação cheia de ramos.

Os **históricos**, porém, seguem o mesmo formato: chave, valor anterior, quem, quando.
Ainda assim ficam em duas tabelas (`config_historico` e `prompts_historico`), porque
uma tabela única precisaria de uma coluna dizendo de qual origem a chave veio — e
duas chaves homônimas de origens diferentes se confundiriam. Duas tabelas de
formato idêntico custam menos que uma com discriminador.

### Cache com invalidação por escrita, não leitura a cada uso

`NUCLEO_FIXO` é lido em toda montagem de system prompt; as perguntas da anamnese,
a cada mensagem recebida. Consultar o banco em cada uso é desperdício e acopla
funções hoje puras a I/O.

Cada processo mantém um cache em memória, invalidado na escrita. **Com um porém que
não pode passar em silêncio:** o bot e o admin são processos separados. Escrever
pelo admin invalida o cache **do admin**, não o do bot. O bot só veria a mudança ao
reiniciar.

Solução adotada: o cache guarda o `atualizado_em` mais recente da tabela, e uma
consulta barata (`SELECT MAX(atualizado_em)`) confirma a validade antes de servir o
valor cacheado. É uma leitura de índice por uso, não a linha inteira. Alternativa
descartada: TTL de N segundos — introduz uma janela em que o bot manda mensagem com
texto que o operador acabou de corrigir, e o operador não tem como saber.

### Semente na primeira leitura, não em migração separada

Na primeira vez que uma chave é lida e não existe no banco, ela é semeada com a
constante do código e devolvida. Isso mantém `schema.sql` como a única definição de
estrutura, sem script de seed que possa não rodar, e garante que o comportamento
do dia zero seja idêntico ao de hoje.

O valor de fábrica continua vivendo no código, o que é o que torna "restaurar
padrão" possível: é a constante, não uma cópia da primeira linha do histórico.

### Confirmação reforçada só para o núcleo fixo

O núcleo carrega a Regra 1b — nunca inventar dado de saúde — e as outras sete regras.
Editá-lo é permitido por decisão do dono do produto, mas exige **digitar a palavra
de confirmação** (o nome da chave) numa segunda etapa. As demais chaves usam a
confirmação de duas telas que já é padrão.

A distinção não é de gravidade genérica: é que um erro no núcleo altera o
comportamento do assistente com **todos** os participantes ao mesmo tempo, de forma
que ninguém percebe até alguém receber um conselho que o sistema não deveria dar.

### Reversão é uma escrita nova, nunca um apagamento

Reverter grava o valor antigo como valor atual **e** acrescenta uma linha nova ao
histórico. O histórico é append-only como todo o resto do projeto: nada é removido,
e o rastro mostra que houve uma reversão, não que a mudança nunca aconteceu.

### Teste de persona: rascunho não salvo, com contexto fictício

O item 6 deixa a escolha entre testar só a versão salva ou também o rascunho.
**Adotado: o rascunho.** Testar só o que já foi salvo inverte a ordem útil — seria
publicar para todos os participantes e só então descobrir o efeito, que é
exatamente o que o teste existe para evitar. O custo é passar o texto do formulário
para a rota de teste, o que é uma linha.

O contexto de anamnese é **fictício e fixo**, definido no código. Nunca o de um
participante real: o teste seria uma forma de ler dado de saúde de alguém sem abrir
a página dele, fora do rastro de auditoria.

A chamada **não** grava em `historico_interacoes`, não referencia `usuario_id` e
não altera contador nenhum. É uma chamada isolada ao `chamarLLM` que já existe.

### Debounce: no adaptador do WhatsApp, e só lá

Buffer `Map` de `usuario_id` para `{ timer, mensagens }`, dentro de
`src/whatsapp/handler.js`. `DEBOUNCE_SEGUNDOS = 0` é o padrão e significa o
comportamento de hoje — resposta imediata —, então a funcionalidade nasce desligada.

**Não sobe para o núcleo, e isso não contraria o AGENTS §5b — confirma.** Debounce é
comportamento de TRANSPORTE, da mesma família da transcrição de áudio e do filtro de
grupo: existe porque o WhatsApp entrega mensagem quando quer e a resposta é empurrada
depois. O núcleo continua recebendo uma mensagem e devolvendo uma resposta.

**No canal web ele não faz sentido, e nem caberia.** A rota é
requisição-resposta: a resposta volta na mesma chamada. Segurar a requisição por
segundos para agrupar deixaria a pessoa olhando a tela travada, e devolver vazio
não teria para onde mandar a resposta depois — a web não tem entrega proativa, por
decisão de produto.

E a rajada simplesmente não acontece lá: o cliente desabilita o botão enquanto a
chamada está pendente (`enviando` em `app.js`), então a pessoa não consegue mandar
três mensagens seguidas. O debounce conserta um problema que só existe no WhatsApp.

Áudio entra no buffer **transcrito e na ordem de chegada**. Deixar áudio passar
direto faria a resposta chegar fora de ordem em relação ao texto que veio antes,
e a pessoa não teria como entender por quê.

A anamnese não passa pelo buffer em hipótese alguma: ela é pergunta-resposta de um
passo por vez, e agrupar duas mensagens ali faria a máquina de estados pular um
estado ou gravar duas respostas no mesmo campo.

## Risks / Trade-offs

**O núcleo fixo editável é o maior risco desta mudança.** Uma edição descuidada
pode remover a proibição de inventar dado de saúde ou a de não agir como
terapeuta, e o efeito aparece silenciosamente, na conversa de todos. Mitigação:
confirmação reforçada, histórico com autor, reversão em um clique e restauração de
fábrica. Nenhuma delas impede o erro — apenas encurtam o tempo até desfazê-lo.

**Atualização depois da correção de segurança de 27/08:** o núcleo ganhou a
**Regra 1c** — nunca instruir, sugerir, lembrar ou perguntar sobre tomar, ajustar,
atrasar ou pular medicamento. Ela entrou porque o modelo, em produção, mandou uma
pessoa real tomar o remédio dela e depois negou ter mandado. Editar o núcleo pela
interface passa a significar poder apagar **essa** regra.

O que sustenta a decisão mesmo assim: aquela correção deixou **duas camadas**, e só
uma delas é editável. A segunda é `src/conversa/seguranca.js`, um bloqueio
determinístico que varre a resposta do modelo antes do envio e **não passa por
`prompts_versionados`** — apagar a Regra 1c pela tela degrada a primeira camada e
não toca na segunda.

Isso vira requisito, não confiança: a segunda camada SHALL NOT ser editável pela
interface. Quem quiser mexer nela mexe no código, com revisão e teste.

**O teste de mensagem tem custo real por clique.** É a primeira funcionalidade do
admin que gasta dinheiro por uso. Ver a pergunta (c).

**Cache entre dois processos.** A consulta de validade resolve, mas acrescenta uma
leitura por uso. Na escala do piloto é irrelevante; num volume maior, seria o
primeiro lugar a revisar.

**Mais uma tabela de histórico que só cresce.** Nenhuma poda prevista. Com cinco
participantes e um operador, levaria anos para importar.

**O debounce muda o ritmo percebido do bot.** Ligá-lo faz o assistente parecer mais
lento. Por isso nasce em `0` e a decisão de ativar é explícita.

---

## Decisões do dono do projeto

As três perguntas abaixo foram levantadas e **respondidas**. Ficam registradas com
as opções que estavam na mesa, para que a escolha continue legível depois.

### (a) Re-consentimento quando o texto muda de versão

**DECIDIDO: consentimento antigo continua válido.** Não há fluxo de
re-consentimento. Quem aceitou a `v1` segue consentido quando o texto virar `v2`,
com a versão que aceitou registrada em `consentimento_versao`.

Consequência que fica documentada no README: se uma edição futura mudar **o que é
feito com o dado** — e não apenas a redação —, o consentimento registrado deixa de
cobrir o tratamento real, e aí a decisão precisa ser revista. Enquanto as edições
forem de redação, a escolha se sustenta.

A página do participante passa a marcar quem está numa versão anterior. Isso é o
que torna a decisão auditável: dá para ver, a qualquer momento, quem aceitou o quê.

Opções que estavam na mesa:

**Opção 1 — continua válido.** ← escolhida Nada muda para quem já aceitou; a versão antiga
fica registrada em `consentimento_versao`. Simples, não interrompe ninguém, e
preserva o rastro de qual texto cada pessoa aceitou. Risco: se a `v2` mudar o que
é feito com o dado — e não apenas a redação —, o consentimento registrado deixa de
cobrir o tratamento real, que é o cenário que a LGPD trata com mais rigor.

**Opção 2 — precisa reconsentir.** A próxima mensagem de quem está numa versão
antiga dispara o texto novo antes de qualquer outra coisa, como no onboarding.
Juridicamente mais seguro, e mantém `consentimento_versao` significando o que
promete. Custo: interrompe a rotina de todo mundo a cada correção de texto,
inclusive uma vírgula — o que empurra o operador a evitar corrigir o texto, que é o
oposto do objetivo.

Uma terceira leitura possível, que registro sem adotar: distinguir edição
**material** de **redacional** no momento de salvar, e só exigir reconsentimento na
primeira. Mais preciso, e transfere para o operador um julgamento jurídico a cada
edição.

### (b) Persistência do buffer de debounce

**DECIDIDO: buffer em memória, limitação aceita.** Sem tabela e sem recuperação na
subida. Se o container reiniciar dentro da janela de poucos segundos, as mensagens
em buffer se perdem — fica documentado no README, para que o comportamento não
apareça depois como bug misterioso.

Opções que estavam na mesa:

**Opção 1 — aceitar em memória.** ← escolhida Simples, sem tabela, sem recuperação na subida.
A janela de perda é de segundos e reinício é raro. Perder uma mensagem de alguém em
sobrecarga não é neutro, mas o custo de evitá-lo é desproporcional.

**Opção 2 — persistir em SQLite.** Tabela de mensagens pendentes, escrita a cada
chegada e leitura na subida. Robusto, e acrescenta escrita no caminho quente de
toda mensagem recebida para cobrir um evento raro.

### (c) Custo do teste de mensagem

**DECIDIDO: limite de 20 por administrador e hora, configurável.** O teto não é
constante no código: entra como mais uma chave da configuração viva
(`TESTE_IA_LIMITE_HORA`, padrão 20), com a mesma validação de faixa, o mesmo
histórico e a mesma reversão das demais.

Isso resolve o caso acidental — formulário reenviado em laço, aba esquecida
recarregando — sem obrigar a um deploy quando 20 se mostrar apertado ou folgado
demais numa sessão real de calibração. Zero SHALL significar sem limite.

Opções que estavam na mesa:

**Opção 1 — sem limite.** É um operador calibrando; o custo por chamada é de
centavos. Confia no bom senso de quem opera.

**Opção 2 — limite por administrador e hora** (por exemplo, 20). Protege contra o
caso acidental — um formulário reenviado em laço, um refresh insistente. Custa uma
contagem em memória e uma mensagem de recusa. ← escolhida, com o teto configurável
em vez de fixo no código
