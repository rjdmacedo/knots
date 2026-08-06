# AGENTS.md

## Cursor Cloud specific instructions

Knots is a single Next.js 16 (App Router, React 19) app — a Splitwise alternative for splitting expenses. It uses tRPC, Prisma, and PostgreSQL, managed with `pnpm`. Standard commands live in `package.json` scripts (`dev`, `build`, `start`, `lint`, `check-types`, `test`, `seed`, `studio`) and setup steps are in `README.md` / `CONTRIBUTING.md`; prefer those instead of duplicating them here.

The environment (Node, pnpm, PostgreSQL, dependencies) is already installed by the startup update script (`pnpm install`). The notes below cover only non-obvious caveats.

### Node version

- The repo pins Node `24.17.0` (`.nvmrc`), installed via `nvm`. The VM also has an `/exec-daemon/node` (v22) shim that appears earlier in `PATH`, so a durable `PATH` prepend was added to `~/.bashrc` to make Node 24 win in interactive shells. Verify with `node --version` → should print `v24.17.0`. If a non-interactive context resolves to v22, run `nvm use 24.17.0` first.

### PostgreSQL (must be started manually each session)

- PostgreSQL 16 is installed via `apt` (Docker is not available in this VM). The server does NOT auto-start on VM boot. Start it before running the app, migrations, tests that hit the DB, or `pnpm seed`:
  - `sudo pg_ctlcluster 16 main start`
- Connection is `postgresql://postgres:1234@localhost:5432/postgres` (role `postgres`, password `1234`), which matches the `.env`. The `scripts/start-local-db.sh` helper is Docker-based and will NOT work here — use the `pg_ctlcluster` command above instead.

### Environment file

- `.env` is git-ignored and created manually (not committed). It sets the two `POSTGRES_*` URLs, `AUTH_SECRET`, and `NEXTAUTH_URL=http://localhost:3000`. Optional integrations are intentionally disabled/omitted because they need external services: S3/MinIO (`NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS=false`), OpenAI receipt/category extraction, Resend email, and Web Push (VAPID). The core app (auth, groups, expenses, balances, settlements) runs fully without them; enable a feature only when its external credentials are provided.

### Database migrations & seed

- Apply schema with `npx prisma migrate deploy` (dev server does not auto-migrate). Seed demo data with `pnpm seed`.
- Seed users: usernames `rafael`, `alice`, `bob`, `carol`, `dave` (emails `delivered+<name>@resend.dev`), all with password `Password1`. Rafael is the creditor across seeded groups/expenses. Re-running `pnpm seed` clears and recreates all data.

### Running & health

- `pnpm dev` serves on `http://localhost:3000` (Turbopack). Health: `GET /api/health` returns DB connectivity; `GET /api/health/liveness` for liveness only.

### Pre-commit hook

- Husky `pre-commit` runs `pnpm prettier`, `pnpm check-types`, and `lint-staged`. Ensure formatting/types pass before committing.
