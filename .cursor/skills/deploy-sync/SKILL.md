---
name: deploy-sync
description: Protocolo oficial para subir código para a produção da **XiaX** na VPS.
---

# SKILL: Deploy & Sync
Protocolo oficial para subir código para a produção da **XiaX** na VPS.

> ⚠️ A produção roda em **Docker Compose**, NÃO em PM2. A partir de Mai/2026 o time trabalha
> direto na `main` (a branch `codex/deploy-entrega-*` foi consolidada no `main`).
> NUNCA fazer `git reset --hard origin/main` na VPS — apagaria a working tree e config local.

## 0. Fatos da infra (não esquecer)
- **Pasta na VPS:** `/opt/gestaonossa`
- **Acesso (deploy roda como `root`):** `root@72.60.166.21:22` (credenciais em `scripts/deploy.config`, gitignored).
- ⚠️ **`git pull` na VPS está quebrado:** deploy key `~/.ssh/xiax_deploy` ausente — ver `docs/DEPLOY.md`.
  ⚠️ **NÃO use `deploy`:** `/home/xiax` é `drwxr-x---` (dono `xiax`) e `deploy` não está
  nesse grupo → `Permission denied` no `cd public_html`. Além disso o `.git` de produção é **owned por
  `root:root`** (rodar git como outro usuário dá "dubious ownership"). Por isso o SSH do deploy é como `root`.
  `sudo` é proibido pelas regras globais — conectar direto como root, não escalar com sudo.
- **Runtime:** Docker Compose — `frontend` (`127.0.0.1:4102→3000`), `backend`
  (`127.0.0.1:4101→4000`, `/health`), `db` (mariadb:11), `phpmyadmin`
- **Proxy:** Apache (host) → `.htaccess` proxia `4101` (api/uploads/health) e `4102` (web)
- **Migrations:** o container `backend` roda `prisma migrate deploy` no entrypoint a cada start
- **Repo:** `Ssnowzx/xiaxIA` (ex-`XiaxAgencia`, renomeado)
- **Config de prod não-commitada (preservar):** `.htaccess` (ACME) e `docker-compose.yml`
  (`SETTINGS_ENCRYPTION_KEY`). O cherry-pick não toca nelas.

## 1. Comando Mestre (forma recomendada)
Da máquina local, na raiz do repo:
```bash
./scripts/deploy-prod.sh                 # aplica HEAD, rebuilda frontend (+ backend se o commit mexe nele)
./scripts/deploy-prod.sh -c <sha>        # aplica um commit específico
./scripts/deploy-prod.sh -m "feat: x"    # commita tudo, push e deploy
./scripts/deploy-prod.sh -s all          # força rebuild de todos os serviços
./scripts/deploy-prod.sh -n              # só sincroniza código, sem rebuild
```
O script faz: commit opcional → `git push` → cherry-pick idempotente na branch de produção →
rebuild Docker do(s) serviço(s) → healthcheck (`/health` + frontend = HTTP 200).
Se o commit tocar `backend/` (inclui `prisma/`), o backend entra no rebuild automaticamente
(garante o `migrate deploy`). Conflito no cherry-pick = `--abort` (produção nunca fica quebrada).

Spec de referência: `.specs/deploy-producao/`.

## 1.1 Deploy CIRÚRGICO (quando a working tree de prod está suja)
Se a prod tem mudanças **staged/não-commitadas** (acontece — features aplicadas via `checkout` e não
commitadas), o `cherry-pick` do `deploy-prod.sh` **falha** ("local changes would be overwritten").
Nesse caso use os scripts cirúrgicos (aplicam só os arquivos dos commits via `git checkout <sha> --`,
sem cherry-pick, sem tocar no staged nem em `.htaccess`/`docker-compose.yml`; depois rebuild + healthcheck):
```bash
./scripts/prod-status.sh                 # READ-ONLY: branch + git status -sb + diff + stash da VPS
./scripts/deploy-files.sh <sha> [<sha>…] # aplica os arquivos desses commits e rebuilda o frontend
./scripts/deploy-landing.sh [<sha>]      # atalho: só o PublicLandingPage.tsx (default 0c717a2)
```
> Nota (jun/2026): nesta sessão o **SSH pelo agente funcionou** (expect manda a senha do `deploy.config`
> automaticamente; deploy via `deploy-files.sh` aplicou landing+tema e rebuildou o frontend com sucesso).
> Ainda assim, se travar/pendurar, caia pro fluxo do usuário rodar com `! ./scripts/…`. Não fazer
> rajadas (fail2ban). Verificação pública: `curl -s -o /dev/null -w '%{http_code}' https://gestaonossa.com.br`.

## 2. Fluxo manual equivalente (se precisar fazer na mão)
```bash
# Local
git push origin main

# VPS (como root — ver §0)
ssh -p 22 root@72.60.166.21
cd /opt/gestaonossa
git fetch origin
git cherry-pick <sha>                     # NUNCA "reset --hard origin/main"
docker compose up -d --build frontend     # use "backend" ou sem arg (todos) se mexeu no backend
docker compose ps
curl -s http://127.0.0.1:4101/health      # backend
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4102   # frontend
```

## 3. Segurança
- NUNCA `git reset --hard origin/main` na VPS (apaga a working tree + config local).
- NUNCA `migrate dev` na VPS (ambiente não interativo). O entrypoint já usa `migrate deploy`.
- Frontend usa `--legacy-peer-deps` (já embutido no Dockerfile) para conflitos do Next.js.
- Segredos de deploy ficam em `scripts/deploy.config` — fora do Git, nunca commitar.
