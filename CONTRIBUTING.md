## Contributing to Knots

Thanks for your interest in contributing!

### Setup for local development

- **Install dependencies**

```bash
npm install
```

- **Start a local PostgreSQL instance** (if you don't already have one) and ensure your `.env` matches your local DB configuration.

- **Run migrations and seed data**

```bash
npx prisma migrate deploy
npm run seed
```

- **Start the app**

```bash
npm run dev
```

### Coding guidelines

- **TypeScript first**: Prefer strict, explicit types over `any`.
- **Use lodash-es helpers**: When transforming or sampling collections, prefer utilities from `lodash-es` (for example `map`, `groupBy`, `sample`, `uniqBy`) instead of hand‑rolled loops, unless a plain loop is clearly simpler.
- **Functional utilities over mutation**: Favour pure helpers and immutable updates where practical.
- **No redundant comments**: Only add comments for intent, trade‑offs, or non‑obvious behaviour.
- **Formatting & linting**

```bash
npm run lint
npm run check-types
```

### Database & Prisma

- **Schema changes**
  - Update `prisma/schema.prisma`.
  - Run `npx prisma migrate dev --name <change>` for local development.
- **Seeding**
  - Keep `prisma/seed.ts` idempotent where possible.
  - Use `faker` and `lodash-es` helpers for generating realistic, varied data.

### Pull requests

- Keep PRs focused and small when possible.
- Add or update tests when you change behaviour.
- Describe the motivation, high‑level approach, and any trade‑offs in the PR description.

### Releases

Releases are created automatically when code is **pushed to `main`** and commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **`fix:`** or **`fix(scope):`** → patch (e.g. 1.20.6 → 1.20.7)
- **`feat:`** or **`feat(scope):`** → minor (e.g. 1.20.6 → 1.21.0)
- **`feat!:`** or **`BREAKING CHANGE:`** in the footer → major

Use lowercase and a colon: **`feat: ...`** or **`feat(scope): ...`**. For squash-merged PRs the commit message is the PR title, so set the PR title to e.g. **`feat: local improvements`** or **`fix(docker): build and share URL`** so that a new release is generated.

The **Release** workflow runs on push to `main`, runs semantic-release, then triggers the **CD** workflow to build and push the Docker image.
