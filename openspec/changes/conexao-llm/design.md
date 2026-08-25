## Context

`tars` e `dashboard` são containers separados que compartilham **apenas** o volume
`tars_data`, montado em `/data`. Ambos rodam como `root` na mesma imagem.

`env_file: .env` do Compose é lido **uma vez**, quando o container sobe: o Docker
injeta as variáveis no processo. Não é um arquivo que o processo consiga reabrir
para ver mudanças, e escrever num `.env` de dentro do container não alcança o
outro container nem sobrevive a um rebuild.

A Fase 2 (`admin-backend-fase2`, ainda não implementada) registra como não-objetivo
explícito "chave de API na interface, em qualquer forma", e mantém as credenciais
fora de `config_global`. Esta mudança **não contradiz** aquela decisão: ela mantém
a credencial fora da configuração viva e fora do banco, e resolve o problema por
outro caminho.

## Goals / Non-Goals

**Goals:**

- Rotacionar uma chave sem SSH e sem reinício.
- Nunca devolver a chave depois de gravada.
- Fechar o vazamento em potencial pelo corpo do erro.
- Cobrir os três provedores, não só um.

**Non-Goals:**

- Histórico e reversão de chave — ver Decisões.
- Validar a chave contra o provedor no momento de salvar.
- Trocar a chave de transcrição, que continua sendo a da OpenAI.
- Múltiplos conjuntos de credenciais, por ambiente ou por participante.

## Decisions

### Tela própria, não dentro da tela de IA

A Fase 2 ainda não foi implementada (`0/49 tasks`), então a tela de IA/Persona não
existe para receber uma seção. Mesmo que existisse, a separação se justifica: a
tela de IA é sobre **comportamento** — texto que se edita, versiona e reverte
livremente; esta é sobre **credencial** — valor que se escreve e nunca mais se lê.
Misturar as duas convida ao erro de aplicar a uma o modelo mental da outra.

Se a Fase 2 for implementada depois, a tela de IA linka para esta.

### Arquivo no volume, não `.env` e não SQLite

**Não `.env`:** é lido uma vez na subida do container. Escrever nele de dentro do
processo não alcança o outro container e some no próximo rebuild.

**Não SQLite:** a credencial passaria a viver na mesma tabela genérica que várias
telas consultam, e num banco que tem "ver histórico" como funcionalidade. Quanto
menos código consegue ler o valor, menor a chance de um bug expô-lo. O banco também
é o que se copia em backup e o que se inspeciona quando algo dá errado.

`/data/llm-chaves.json`, com permissão `0600`. O modo é aplicado na escrita; o
volume Docker o preserva. Como os dois containers rodam como o mesmo usuário,
`0600` não impede o bot de ler — impede qualquer outro usuário que venha a existir.

Formato:

```json
{
  "claude":   { "apiKey": "...", "model": "claude-sonnet-5" },
  "openai":   { "apiKey": "...", "model": "gpt-4o" },
  "deepseek": { "apiKey": "...", "model": "deepseek-chat" }
}
```

### Escrita atômica

O admin escreve enquanto o bot pode estar lendo. Escrever direto sobre o arquivo
deixa uma janela — de milissegundos, mas real — em que o bot lê JSON truncado e
falha a chamada.

A escrita grava num arquivo temporário no mesmo diretório e o renomeia por cima.
`rename` dentro do mesmo sistema de arquivos é atômico: o leitor vê ou o conteúdo
antigo inteiro, ou o novo inteiro, nunca metade.

### Leitura ao vivo por horário de modificação

Cada processo mantém o conteúdo em memória e guarda o `mtime` que leu. Antes de
servir o valor, um `fs.stat` confirma se o arquivo mudou; se mudou, relê.

É o mesmo princípio do `MAX(atualizado_em)` que a Fase 2 usa para configuração no
banco, adaptado para arquivo: uma chamada barata de metadados por uso, em vez de
reler o conteúdo. Sem isso, trocar a chave pelo admin não alcançaria o bot até o
próximo reinício — e ninguém teria como perceber, porque o admin mostraria a chave
nova como configurada enquanto o bot seguiria usando a antiga.

### Ordem de resolução em dois degraus

1. o arquivo, se tiver aquele provedor configurado;
2. a variável de ambiente correspondente.

**Não há terceiro degrau.** A configuração viva da Fase 2 tem três porque existe
constante de fábrica no código; uma credencial não tem — e não deveria. Faltando
os dois, a chamada falha com erro dizendo qual variável **ou** qual campo da tela
preencher.

O erro é explícito de propósito: falhar em silêncio, ou cair noutro provedor por
conta própria, faria o piloto responder com um modelo que ninguém escolheu.

### Sem histórico, sem reversão — e por isso confirmação em duas etapas

Toda outra configuração deste admin tem histórico e reversão. Esta **não tem**, de
propósito: guardar a chave anterior significaria manter uma credencial provavelmente
revogada, num lugar consultável, para nunca usá-la.

A consequência é que sobrescrever é irreversível. Por isso, sobrescrever uma chave
já configurada passa por confirmação em duas etapas — a mesma que o projeto já usa
para ação destrutiva. Configurar pela primeira vez não precisa: não há o que perder.

### O erro nunca carrega o corpo bruto

`src/llm/router.js` hoje monta a exceção com o corpo da resposta de erro. Alguns
provedores ecoam a credencial recebida no 401, e a exceção vira log do Docker.

Passa a registrar apenas provedor e código de status. O corpo é descartado — sem
tentar filtrar a chave dele, porque filtrar exige acertar o formato de cada
provedor a cada mudança de API, e errar uma vez basta para vazar.

Perde-se detalhe de diagnóstico. É troca aceita: o código de status distingue os
casos que importam (401 credencial, 429 cota, 5xx provedor fora).

### O valor completo não sai do repositório de credenciais

O módulo expõe `status(provider)`, que devolve apenas
`{ configurado, ultimosCaracteres, model }`. A chave inteira só é devolvida por
`ler(provider)`, chamada exclusivamente pelo router.

A tela nunca recebe o valor: o campo de chave é write-only e carrega vazio, mesmo
para quem acabou de salvar. Não há caminho de leitura para a interface, e portanto
não há como um template exibi-lo por engano.

## Risks / Trade-offs

**Backup do volume passa a conter credenciais.** Antes, o volume tinha dado de
saúde e a sessão do WhatsApp; agora tem também chaves de API de terceiros. Quem
copiar o volume copia isso junto — vale para snapshot de disco também.

**Recriar o volume apaga as credenciais.** O README já documenta a recriação para
mudança de schema. Passa a apagar mais uma coisa, e a tela é o único caminho de
volta.

**O modelo é texto livre.** Não há lista fechada — modelos novos aparecem e listas
fechadas envelhecem. Um nome errado só falha na primeira chamada, com erro do
provedor. Validar contra a API no momento de salvar resolveria, e adiciona uma
chamada paga a cada gravação.

**Menos detalhe no erro de provedor.** Descartar o corpo custa diagnóstico. O
código de status cobre os casos frequentes.

**A tela concentra as três credenciais.** Quem alcança o admin alcança a
capacidade de trocar todas. Já era verdade para quem tinha SSH; agora vale para
quem tem a senha do admin, que é uma superfície maior.
