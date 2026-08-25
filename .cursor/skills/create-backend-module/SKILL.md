---
name: create-backend-module
description: Ensina a criar novo módulo seguindo o padrão **Rotas Robustas** do Xiax.
---

# SKILL: Create Backend Module
Ensina a criar novo módulo seguindo o padrão **Rotas Robustas** do Xiax.

## 1. Estrutura (Padrão: Rota Única)
```
backend/src/modules/<name>/
  └── <name>.routes.ts  ← Zod + Prisma + notify + logActivity (tudo aqui)
```

**Não crie** `*.service.ts` ou `*.schema.ts` por padrão. A validação Zod fica inline.

## 2. Template (`<name>.routes.ts`)
```typescript
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { authenticate } from '../../middleware/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import { notify } from '../../lib/notify'
import { logActivity } from '../../lib/activity'

const router = Router()
router.use(authenticate)  // ← Protege todas as rotas

const createSchema = z.object({
  field1: z.string().min(2),
  field2: z.number().optional(),
})

const updateSchema = createSchema.partial()

// GET /api/<name>/
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { companyId } = req.user!
    const items = await prisma.<model>.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(items)
  }),
)

// POST /api/<name>/
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { companyId, id: userId } = req.user!
    const data = createSchema.parse(req.body)

    const item = await prisma.<model>.create({
      data: { ...data, companyId },
    })

    await notify({
      companyId,
      actorId: userId,
      kind: 'INFO',
      title: `Nova entrada: ${item.name || 'item'}`,
      link: '/<route>',
    })

    await logActivity({
      companyId,
      actorId: userId,
      action: '<model>.created',
      entityType: '<Model>',
      entityId: item.id,
      metadata: { field: item.field1 },
    })

    res.status(201).json(item)
  }),
)

// PATCH /api/<name>/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { companyId, id: userId } = req.user!
    const data = updateSchema.parse(req.body)

    const existing = await prisma.<model>.findFirst({
      where: { id: req.params.id, companyId },
    })
    if (!existing) throw AppError.notFound('<Model> não encontrado')

    const item = await prisma.<model>.update({
      where: { id: req.params.id },
      data,
    })

    await logActivity({
      companyId,
      actorId: userId,
      action: '<model>.updated',
      entityType: '<Model>',
      entityId: item.id,
      metadata: { field: item.field1 },
    })

    res.json(item)
  }),
)

// DELETE /api/<name>/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { companyId, id: userId } = req.user!

    const existing = await prisma.<model>.findFirst({
      where: { id: req.params.id, companyId },
    })
    if (!existing) throw AppError.notFound('<Model> não encontrado')

    await prisma.<model>.delete({ where: { id: req.params.id } })

    await logActivity({
      companyId,
      actorId: userId,
      action: '<model>.deleted',
      entityType: '<Model>',
      entityId: existing.id,
    })

    res.status(204).send()
  }),
)

export default router
```

## 3. Regra Híbrida: Quando Extrair Service
**APENAS SE:**
- Arquivo `.routes.ts` ultrapassa **150 linhas**, OU
- Lógica envolve **processamento complexo** (APIs externas, cálculos, orquestração multi-tabela)

**Exemplo:** `tasks.routes.ts` tem 422 linhas + lógica de comentários + reordenação + aceitação/recusa → candidato a refatoração (issue separada).

## 4. Registro no App
Após criar, registre em `backend/src/app.ts`:
```typescript
import <name>Routes from './modules/<name>/<name>.routes'
app.use('/api/<name>', <name>Routes)
```

## 5. Checklist
- [ ] Modelo existe em `schema.prisma`
- [ ] `.routes.ts` tem `authenticate` no topo
- [ ] Todas as queries filtram por `companyId`
- [ ] Zod schemas validam antes de Prisma
- [ ] `asyncHandler` envolve cada handler
- [ ] Chamadas `notify()` + `logActivity()` após mutations
- [ ] Registrado em `app.ts`
- [ ] `npx prisma generate` executado
