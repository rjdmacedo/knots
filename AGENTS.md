# AGENTS.md

## Cursor Cloud specific instructions

Knots is a single Next.js 16 (App Router, React 19) app — a Splitwise alternative for splitting expenses. It uses tRPC, Prisma, and PostgreSQL, managed with `pnpm`. Standard commands live in `package.json` scripts (`dev`, `build`, `start`, `lint`, `check-types`, `test`, `seed`, `studio`) and setup steps are in `README.md` / `CONTRIBUTING.md`; prefer those instead of duplicating them here.

The environment (Node, pnpm, PostgreSQL, dependencies) is already installed by the startup update script (`pnpm install`). The notes below cover only non-obvious caveats.

### Node version (v24 LTS only)

- The repo pins Node `24.17.0` (`.nvmrc`), installed via `nvm` (nvm holds only this version). Verify with `node --version` → `v24.17.0`.
- Gotcha: the VM injects an `/exec-daemon/node` (v22) shim into `PATH`. It sits behind `/usr/local/cargo/bin`, which is the first `PATH` entry, so Node 24 is pinned by symlinking the toolchain there ahead of the shim: `/usr/local/cargo/bin/{node,npm,npx,corepack,pnpm,pnpx}` → `~/.nvm/versions/node/v24.17.0/bin/*`. This makes v24 win in every shell (interactive, login, and non-interactive `bash -c` such as the startup update script), not only those that source `~/.bashrc`. A `~/.bashrc` PATH prepend is also present as a redundant fallback.
- Do NOT delete `/exec-daemon/node` — it is Cursor runtime infrastructure (root-owned) and the daemon calls it by absolute path, so shadowing it in `PATH` is safe. These symlinks persist in the VM snapshot; if Node 24 ever stops resolving, recreate them.

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
