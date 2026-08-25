## Why

A personalidade é o que define o tom de toda mensagem que o bot manda para a
pessoa — `direto`, `caloroso` ou `neutro`. Ela é escolhida uma única vez, no
estado 10 da anamnese, e nunca mais.

Isso é um problema previsto pelo próprio produto: o estado 10 cai em `neutro`
por padrão quando a resposta não é reconhecida na segunda tentativa. Ou seja,
existe um caminho conhecido em que a pessoa **fica com um tom que não escolheu**.
Também é razoável que alguém peça outro tom depois de conviver com o primeiro.

Hoje corrigir isso exige `UPDATE` direto no SQLite, que é exatamente o que o
backend administrativo foi construído para eliminar.

## What Changes

- A página de detalhe do participante ganha uma ação para trocar a personalidade
  entre os três valores.
- A troca é auditada como qualquer outra escrita do operador.

## Capabilities

### Modified Capabilities

- `admin-operacao`: ação de trocar a personalidade do participante.

## Impact

- **Código:** `src/dashboard/rotas/usuario.js` (a ação na tela),
  `src/dashboard/rotas/acoes.js` (a rota), `test/admin.test.js`.
- **Schema:** nenhum. A coluna e o CHECK já existem.
- **Dependências:** nenhuma.
