[<img alt="Knots" height="60" src="./public/logo.svg" />](https://knot.app)

Knots is a free and open source alternative to Splitwise. It is a fork of [Spliit](https://github.com/spliit-app/spliit) with user accounts, friends, settlements, and other features on top of the original group-expense flow.

You can use the official instance at [Knot.app](https://knot.app), or deploy your own:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frjdmacedo%2Fknots&project-name=my-knot-instance&repository-name=my-knot-instance&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D&)

## Features

- [x] User accounts (register, login, email verification, password reset)
- [x] Create a group and invite friends
- [x] Create expenses with description, notes, and categories
- [x] Split evenly, by shares, by percentage, or by amount
- [x] Multi-payer expenses
- [x] Display group balances, with optional debt simplification
- [x] Settlements and payment requests
- [x] Recurring expenses
- [x] Friends and direct (1:1) expenses
- [x] Activity log
- [x] Stats dashboards
- [x] Progressive Web App
- [x] Duplicate expense detection and copy-to-new-expense
- [x] Arithmetic expressions in amount fields (e.g. `12+4.50`)
- [x] Multi-currency expenses with server-side FX rates
- [x] Import from Splitwise or Knots; export CSV/JSON
- [x] Search for expenses in a group
- [x] Upload and attach images to expenses (opt-in)
- [x] Create an expense by scanning a receipt (opt-in)
- [x] Deduce category from title (opt-in)
- [x] Push notifications (opt-in)

## Stack

- [Next.js](https://nextjs.org/) 16 (App Router) and [React](https://react.dev/) 19
- [tRPC](https://trpc.io/) for the API
- [Prisma](https://www.prisma.io/) and [PostgreSQL](https://www.postgresql.org/)
- [Auth.js](https://authjs.dev/) (NextAuth v5) for authentication
- [next-intl](https://next-intl.dev/) for translations
- [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/)
- [pnpm](https://pnpm.io/) as the package manager
- [Vercel](https://vercel.com/) for hosting (application and database)

## Contribute

The project is open to contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup conventions, coding guidelines, and how releases work.

If you want to contribute financially and help keep the application free and without ads, you can also:

- 💜 [Sponsor me (Rafael)](https://github.com/sponsors/rjdmacedo), or
- 💙 [Make a small one-time donation](https://donate.stripe.com/28o3eh96G7hH8k89Ba).

### Translation

Translations live in [`messages/`](./messages/). To add or improve a locale, edit the corresponding JSON file (or copy `messages/en-US.json` as a starting point) and open a pull request.

Current locales: Catalan, Chinese (Simplified and Traditional), Czech, Dutch, English, Finnish, French, German, Italian, Japanese, Polish, Portuguese (Brazil and Portugal), Romanian, Russian, Spanish, Turkish, Ukrainian.

## Run locally

Requires **Node.js 24** (see `.nvmrc`) and **pnpm**.

1. Clone the repository (or fork it if you intend to contribute).
2. Start a PostgreSQL server. You can run `./scripts/start-local-db.sh` if you already use Docker; otherwise start PostgreSQL locally and match the URLs in `.env`.
3. Copy `.env.example` to `.env` and set at least:

   ```.env
   POSTGRES_PRISMA_URL=postgresql://postgres:1234@localhost:5432/postgres
   POSTGRES_URL_NON_POOLING=postgresql://postgres:1234@localhost:5432/postgres
   AUTH_SECRET= # openssl rand -base64 32
   NEXTAUTH_URL=http://localhost:3000
   ```

   Optional integrations (S3, OpenAI, Resend, Web Push) can stay disabled. The core app — auth, groups, expenses, balances, and settlements — runs without them.

4. Install dependencies, apply migrations, and (optionally) seed demo data:

   ```bash
   pnpm install
   npx prisma migrate deploy
   pnpm seed
   ```

5. Run `pnpm dev` to start the development server at http://localhost:3000.

Seed users (password `Password1`): `rafael`, `alice`, `bob`, `carol`, `dave`. Emails are `delivered+<name>@resend.dev`. Re-running `pnpm seed` clears and recreates all data.

Useful scripts: `pnpm test`, `pnpm lint`, `pnpm check-types`, `pnpm studio`.

## Run in a container

1. Run `pnpm build-image` to build the Docker image from the Dockerfile.
2. Copy `container.env.example` to `container.env`.
3. Run `pnpm start-container` to start the Postgres and Knots containers.
4. Open http://localhost:3000.

To run on a server using the **pre-built image** from GitHub Container Registry (e.g. after a release) and to **update** the app when a new version is released, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Health check

- `GET /api/health/readiness` or `GET /api/health` — ready to serve requests, including database connectivity.
- `GET /api/health/liveness` — process is running, but not necessarily ready to serve requests.

## Opt-in features

### Expense documents

Knots can upload images (to an AWS S3 bucket) and attach them to expenses. To enable this feature:

- Follow the instructions in the _S3 bucket_ and _IAM user_ sections of [next-s3-upload](https://next-s3-upload.codingvalue.com/setup#s3-bucket) to create and set up an S3 bucket where images will be stored.
- Update your environment variables with appropriate values:

```.env
NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS=true
S3_UPLOAD_KEY=AAAAAAAAAAAAAAAAAAAA
S3_UPLOAD_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
S3_UPLOAD_BUCKET=name-of-s3-bucket
S3_UPLOAD_REGION=us-east-1
```

You can also use other S3 providers by providing a custom endpoint:

```.env
S3_UPLOAD_ENDPOINT=http://localhost:9000
```

### Create expense from receipt

You can offer users to create an expense by uploading a receipt. This feature relies on [OpenAI GPT-4 with Vision](https://platform.openai.com/docs/guides/vision) (or a compatible endpoint) and a public S3 storage endpoint.

To enable the feature:

- You must enable the expense documents feature as well (see section above). That might change in the future, but for now images need to be stored for receipt scanning to work.
- Subscribe to the OpenAI API and get access to a vision-capable model (you might need to buy credits in advance), or point at a compatible provider (see below).
- Update your environment variables with appropriate values:

```.env
NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT=true
OPENAI_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Deduce category from title

You can offer users to automatically deduce the expense category from the title. Since this feature relies on an OpenAI-compatible API, follow the signup instructions above and configure the following environment variables:

```.env
NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT=true
OPENAI_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Custom OpenAI-compatible endpoint (BYO endpoint)

Both AI features (receipt scanning and category extraction) support any OpenAI-compatible API endpoint. This lets you use providers like **Ollama**, **LM Studio**, or **OpenRouter** instead of the official OpenAI API.

Two optional environment variables control this:

| Variable          | Description                            | Default when omitted                                                          |
| ----------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `OPENAI_BASE_URL` | Base URL of your OpenAI-compatible API | Requests go to the official OpenAI API (`https://api.openai.com/v1`)          |
| `OPENAI_MODEL`    | Model identifier for chat completions  | Receipt scanning uses `gpt-4-turbo`; category extraction uses `gpt-3.5-turbo` |

Example configuration using Ollama as the provider:

```.env
# AI feature flags (enable one or both)
NEXT_PUBLIC_ENABLE_RECEIPT_EXTRACT=true
NEXT_PUBLIC_ENABLE_CATEGORY_EXTRACT=true

# Point to your local Ollama instance
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llava

# Required even for keyless providers — use a dummy value
OPENAI_API_KEY=ollama
```

> **Important notes:**
>
> - `OPENAI_API_KEY` must still be set when AI features are enabled, even with providers that don't require a real key (Ollama, LM Studio). Use a dummy value like `ollama` or `not-needed`.
> - `OPENAI_MODEL` applies to **both** receipt scanning and category extraction. Receipt scanning requires a **vision-capable model** since it processes images. If you have receipt scanning enabled, choose a multimodal model (e.g. `llava`, `gpt-4-turbo`).
> - When `OPENAI_BASE_URL` is omitted, requests go to the official OpenAI API as before.
> - When `OPENAI_MODEL` is omitted, each feature uses its own built-in default (`gpt-4-turbo` for receipts, `gpt-3.5-turbo` for categories).

### Push notifications

Web Push is enabled when both VAPID keys are set. Generate a pair with `npx web-push generate-vapid-keys`, then:

```.env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
```

If one key is set, both must be set. Leave both empty to keep push disabled.

### Email (Resend)

Account emails (verification, password reset, invitations, payment requests) are sent with [Resend](https://resend.com/) when configured:

```.env
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=onboarding@resend.dev
```

## License

MIT, see [LICENSE](./LICENSE).
