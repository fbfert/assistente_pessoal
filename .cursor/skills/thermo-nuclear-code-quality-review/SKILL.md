---
name: thermo-nuclear-code-quality-review
description: Auditoria de manutenibilidade extremamente rigorosa para qualidade de abstração, arquivos gigantes e crescimento de spaghetti. Use para "revisão termonuclear", "thermo-nuclear review", auditoria profunda de qualidade de código ou revisão de manutenibilidade especialmente dura no Xiax.
disable-model-invocation: true
---

# Thermo-Nuclear Code Quality Review

Revisão fora do comum, focada em **qualidade de implementação, manutenibilidade, qualidade de
abstração e saúde do codebase** do Xiax. Acima de tudo, esta skill empurra o revisor a ser
**ambicioso** sobre estrutura. Não pare em limpezas locais — caça ativamente por jogadas de
**"code judo"**: reestruturações que preservam o comportamento e deixam a implementação
dramaticamente mais simples, menor, mais direta e elegante.

> Esta skill é **on-demand** (`disable-model-invocation: true`). Só roda quando o Snows pedir
> explicitamente uma "revisão termonuclear".

## Prompt Base

> Faça uma auditoria profunda de qualidade do diff do branch atual.
> Repense como estruturar/implementar as mudanças para melhorar a qualidade **sem alterar comportamento**.
> Melhore abstrações e modularidade, reduza spaghetti, aumente concisão e legibilidade.
> Seja ambicioso: se há caminho claro para melhorar a implementação reestruturando parte do codebase, vá.
> Seja extremamente minucioso e rigoroso. Meça duas vezes, corte uma.

## Contexto da Arquitetura Xiax

A revisão acontece dentro destas convenções — desvios delas são, por si só, smells:

- **Camada canônica do backend:** `backend/src/modules/<name>/<name>.routes.ts` (padrão **Rotas Robustas**).
  Validação Zod + Prisma + `notify` + `logActivity` **inline**. Nada de `*.service.ts`/`*.schema.ts` por padrão.
- **Helpers canônicos (reusar, não duplicar):** `asyncHandler`, `AppError`, `notify`, `logActivity`,
  `authenticate`, `prisma`. Um helper bespoke que reimplementa qualquer um destes é blocker.
- **Invariante multi-tenant:** **toda** query Prisma filtra por `companyId`. Branch que "esquece" o
  `companyId` não é nit — é falha de design (e de segurança).
- **Frontend:** componentes em `frontend/src/components/...`, tipos compartilhados em `tipos/`/`@/types`,
  fonte única de meta-dados (ex.: `benchmark-meta.tsx`) em vez de redefinir interfaces por página.
- **Spec-driven:** toda feature nasce em `.specs/` e termina com `validate.sh` verde. Mudança que
  ignora a spec ou quebra o `validate.sh` correspondente **não aprova**.

## Padrões Inegociáveis

Aplique o prompt base **mais** estas regras explícitas:

0. **Seja ambicioso sobre simplificação estrutural.** Não pare em "dava pra ficar um pouco mais limpo".
   Procure deletar branches/helpers/modos/condicionais/camadas inteiras. Prefira a solução que faz o
   código parecer inevitável em retrospecto. Assuma que quase sempre há um "code judo" disponível: uma
   reorganização que usa a arquitetura existente melhor e deixa a mudança muito mais simples. Se há
   caminho para **deletar** complexidade em vez de rearranjá-la, empurre forte por ele.

1. **Limites de tamanho por camada (regra de tamanho do Xiax):**
   - `<name>.routes.ts` que cruza **150 linhas** ou ganha lógica complexa (APIs externas, cálculos,
     orquestração multi-tabela) → candidato a extrair service. Trate como smell forte por padrão.
   - **Qualquer arquivo** que o PR empurra de **< 1000 para > 1000 linhas** → blocker presumido.
     Prefira extrair helpers, subcomponentes ou módulos. Só dispense com razão estrutural forte e
     arquivo resultante claramente organizado.
   - Se o diff cruza esses limites, pergunte explicitamente se deve ser decomposto **antes**.

2. **Sem crescimento aleatório de spaghetti.** Desconfie de condicionais ad-hoc novos, special cases
   espalhados ou branches one-off enfiados em fluxos não relacionados. "If estranho em lugar aleatório"
   é problema de design, não nit. Empurre a lógica para uma abstração dedicada, helper, máquina de
   estados ou módulo — em vez de embaralhar um caminho existente.

3. **Limpe o design, não só aceite "funciona".** Se o comportamento pode permanecer enquanto a estrutura
   fica significativamente mais limpa, exija a versão mais limpa. Não carimbe "funciona" deixando o
   codebase mais bagunçado. Prefira **remover** peças móveis a espalhar a mesma complexidade.

4. **Prefira código direto e maintainable a hacky/mágico.** Comportamento frágil/ad-hoc/"mágico" é
   problema de qualidade. Seja cético com mecanismos genéricos que escondem suposições simples de
   formato de dado. Sinalize wrappers identidade e helpers pass-through que adicionam indireção sem clareza.

5. **Tipos e fronteiras limpos.** Questione optionalidade desnecessária, `unknown`, `any` e código
   cheio de `as` quando uma fronteira de tipo mais clara existiria. Prefira modelos tipados explícitos
   e contratos compartilhados a objetos ad-hoc soltos. Fallback silencioso que mascara invariante pouco
   clara → torne a fronteira explícita.

6. **Lógica na camada canônica; reuse helpers existentes.** Sinalize lógica de feature vazando para
   caminhos compartilhados ou detalhes de implementação vazando por APIs. Prefira utilitários canônicos
   (`notify`, `logActivity`, `AppError`, `asyncHandler`) a one-offs. Empurre o código para o módulo/
   serviço certo em vez de normalizar drift arquitetural.

7. **Orquestração sequencial e updates não-atômicos são smells** quando a estrutura limpa é óbvia.
   Trabalho independente serializado sem motivo → considere paralelizar. Updates relacionados que podem
   deixar estado pela metade → empurre por estrutura mais atômica. Sem over-index em micro-otimização.

## Perguntas Primárias da Revisão

Para cada mudança relevante, pergunte:

- Existe um "code judo" que deixaria isto dramaticamente mais simples?
- Dá pra reformular para precisar de menos conceitos, branches ou camadas de helper?
- Isto melhora ou piora a arquitetura local?
- O diff adicionou complexidade de branching onde deveria existir uma abstração melhor?
- Um módulo antes coeso ficou mais acoplado, mais stateful ou mais difícil de escanear?
- Esta lógica está no arquivo e camada certos? (`modules/`? `lib/`? `components/`?)
- Há condicionais repetidos sinalizando um modelo ou helper faltando?
- A abstração realmente se paga, ou é só um wrapper?
- O diff introduziu casts, optionalidade ou objetos ad-hoc que obscurecem a invariante real?
- A orquestração é mais sequencial / menos atômica do que precisa?
- Toda query nova respeita `companyId`?

## Sinalize Agressivamente

- Implementação complicada onde uma reformulação deletaria categorias inteiras de complexidade.
- Refactors que **movem** código sem reduzir o número de conceitos na cabeça do leitor.
- Arquivo cruzando 1000 linhas por causa do PR (ou `.routes.ts` cruzando 150) com código separável.
- Condicionais novos parafusados em caminhos não relacionados.
- Booleans one-off, modos nullable ou flags que complicam o controle de fluxo existente.
- Lógica de feature vazando para módulos de propósito geral.
- "Magia" genérica que esconde estrutura simples e dificulta o raciocínio.
- Wrappers finos / abstrações identidade que adicionam indireção sem simplificar.
- Casts, `any`, `unknown` ou params opcionais desnecessários que enlameiam o contrato.
- Lógica copy-paste em vez de helper extraído.
- Edge-case estreito tratado no meio de uma função já ocupada.
- Refactor que passa nos testes mas deixa o código menos modular/legível.
- Branching "temporário" que vira dívida permanente.
- Helper bespoke onde já existe utilitário canônico (`notify`, `logActivity`, `AppError`...).
- Lógica na camada/pacote errado quando deveria viver em lugar mais central.
- Fluxo async sequencial onde trabalho claramente independente ficaria mais simples em paralelo.
- Update parcial que deixa o estado menos atômico do que o necessário.

## Remédios Preferidos

- Deletar uma camada de indireção inteira em vez de poli-la.
- Reformular o modelo de estado para os condicionais **sumirem** (não só centralizarem).
- Mudar a fronteira de ownership para a feature virar extensão natural de uma abstração existente.
- Transformar special-case em fluxo default mais simples com menos exceções.
- Extrair helper ou função pura.
- Quebrar arquivo grande em módulos menores e focados.
- Mover lógica de feature para trás de uma abstração dedicada.
- Trocar cadeias de condição por um modelo tipado ou dispatcher explícito.
- Separar orquestração da lógica de negócio.
- Colapsar branches duplicados em um fluxo mais claro.
- Deletar wrappers que não clarificam a API.
- Reusar o helper canônico em vez de introduzir um quase-duplicado.
- Tornar fronteiras de tipo explícitas para o controle de fluxo simplificar.
- Mover a lógica para o módulo/camada que já é dono do conceito.
- Paralelizar trabalho independente quando isso também simplifica a orquestração.
- Reestruturar updates relacionados em fluxo mais atômico quando estado parcial seria difícil de raciocinar.

Não se contente com "talvez renomear isto" quando o problema é estrutural.
Não se contente com uma versão mais limpa da **mesma ideia bagunçada** se há caminho plausível para uma ideia muito mais simples.

## Tom da Revisão

Direto, sério e exigente quanto à qualidade. Sem grosseria, mas sem amaciar problemas grandes de
manutenibilidade em sugestões mansas. Se o código está bagunçando o codebase, diga isso com clareza.
Se a implementação perdeu uma oportunidade de simplificação dramática, diga isso também.

Boas frases:

- `isto empurra o arquivo além de 1k linhas. dá pra decompor antes?`
- `este .routes.ts passou de 150 linhas e ganhou orquestração — hora de extrair um service?`
- `isto adiciona outro branch special-case num fluxo já ocupado. dá pra mover pra uma abstração própria?`
- `funciona, mas deixa o entorno mais spaghetti. vamos manter o comportamento e reestruturar.`
- `isto parece lógica de feature vazando pra um caminho compartilhado. dá pra isolar?`
- `esta abstração parece desnecessária. dá pra manter o fluxo direto?`
- `por que precisa de cast / optional aqui? dá pra tornar a fronteira explícita?`
- `isto parece helper bespoke pra algo que já temos (notify/logActivity). dá pra reusar o canônico?`
- `acho que tem um code-judo aqui que simplifica muito. dá pra reformular pra esses branches sumirem?`
- `este refactor move complexidade, mas não deleta. dá pra deixar o próprio modelo mais simples?`

## Prioridade dos Achados

1. Regressões estruturais de qualidade
2. Oportunidades perdidas de simplificação dramática / code-judo
3. Aumento de complexidade de spaghetti / branching
4. Problemas de fronteira / abstração / contrato de tipo que dificultam o raciocínio
5. Tamanho de arquivo e decomposição
6. Modularidade e abstração
7. Legibilidade e manutenibilidade

Não inunde com nits de baixo valor se há problemas estruturais maiores. Prefira poucos comentários de
alta convicção a uma lista longa de notas cosméticas.

## Bar de Aprovação

Não aprove só porque o comportamento parece correto. O bar é:

- sem regressão estrutural clara
- sem oportunidade óbvia de simplificação dramática deixada na mesa quando o caminho é visível
- sem explosão injustificada de tamanho de arquivo (1000 geral / 150 em `.routes.ts`)
- sem crescimento óbvio de spaghetti por special-case branching
- sem abstração hacky/mágica que dificulte o raciocínio
- sem churn desnecessário de wrapper/cast/optionalidade obscurecendo o design
- sem leak de fronteira arquitetural nem duplicação de helper canônico
- sem oportunidade óbvia de decomposição deixada de lado
- `validate.sh` da spec correspondente verde; toda query respeita `companyId`

Blockers presumidos (a menos que o autor justifique claramente):

- preserva muita complexidade incidental quando há code-judo plausível que a deletaria
- empurra um arquivo de < 1000 para > 1000 linhas (ou `.routes.ts` além de 150 com lógica complexa)
- adiciona branching ad-hoc que embaralha um fluxo existente
- resolve problema local espalhando checks de feature por código compartilhado
- adiciona abstração/wrapper/cast desnecessário que torna o design mais indireto
- duplica helper existente ou põe lógica na camada errada havendo casa canônica clara

Se essas condições não forem atendidas, deixe feedback explícito e acionável e empurre por uma
decomposição mais limpa.
