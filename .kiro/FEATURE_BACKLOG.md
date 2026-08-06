# Feature Backlog (Kiro seed)

> Purpose: a single entry point for Kiro to start adding features to **Knots**.
> Read this file, then for **each** feature below create a spec folder under
> `.kiro/specs/<slug>/` and run the **requirements-first** workflow
> (`requirements.md` → `design.md` → `tasks.md`, plus `.config.kiro`), exactly
> like the existing specs in `.kiro/specs/`.

## How Kiro should use this file

1. Pick features in the order given under "Suggested order" (top = highest value / lowest risk).
2. For each feature, create `.kiro/specs/<slug>/` and author `requirements.md` in
   the same EARS style used across this repo (Introduction, Glossary, then numbered
   Requirements with a User Story and `WHEN … THE <Component> SHALL …` acceptance criteria).
   See `.kiro/specs/duplicate-expense-detection/requirements.md` as the reference format.
3. Add `.config.kiro` as `{"specId": "<new-uuid>", "workflowType": "requirements-first", "specType": "feature"}`.
4. Then produce `design.md` and a `tasks.md` checklist, and implement task-by-task.
5. Honour repo conventions (`CONTRIBUTING.md`): TypeScript-first, prefer `lodash-es`
   helpers, keep `prisma/seed.ts` idempotent, add/adjust Jest tests, update i18n
   message catalogs in `messages/*.json`, and use Conventional Commit `feat:` messages.

## Project context (already implemented — do NOT re-spec)

Knots is a single Next.js 16 (App Router) app: tRPC (`src/trpc/routers/*`), Prisma +
PostgreSQL (`prisma/schema.prisma`), NextAuth credentials auth (`src/lib/auth/*`),
i18n via next-intl (`messages/*`), PWA + web-push. Already shipped: groups/memberships/
invitations, expenses with 4 split modes + reimbursements + notes + S3 documents,
recurring expenses (materialized on-read in `src/lib/api.ts`), duplicate detection,
friends & direct expenses, balances with debt simplification + settlements + payment
requests, activity log, granular push notifications, categories + auto-assign, stats,
Splitwise/Knots import, CSV/JSON export, BYO OpenAI-compatible endpoint
(`OPENAI_BASE_URL` / `OPENAI_MODEL` via `src/lib/ai-client.ts`), arithmetic
expressions in amount fields (`src/lib/math-expression.ts`), copy expense
(prefill create form from an existing expense).

## Inspiration source

Ideas below are distilled from the sibling fork `antonio-ivanovski/spliit-cloud`
(its `ROADMAP.md`) and the upstream `spliit-app/spliit` issues it references. Each
feature notes the upstream issue for demand signal. Import the _ideas_, not the code
(that fork is a Bun/Turborepo monorepo; Knots stays a single Next.js app).

## Suggested order

1. `server-authoritative-currency-conversion`
2. `multi-payer-expenses`
3. `itemized-expenses`
4. `account-overview-homepage`
5. `profile-avatars`

---

## Done

### `byo-openai-endpoint` — Bring-your-own OpenAI-compatible endpoint

Shipped. Spec: `.kiro/specs/byo-openai-endpoint/`. Self-hosters can set
`OPENAI_BASE_URL` and `OPENAI_MODEL` to route receipt/category AI to any
OpenAI-compatible provider (Ollama, LM Studio, OpenRouter).

### `expense-amount-math-expressions` — Math in the amount field

Shipped. Spec: `.kiro/specs/expense-amount-math-expressions/`. Users can type
arithmetic expressions (e.g. `12+4.50`, `100/3`, `(50+25)*2`) in the amount
input; evaluated on blur/submit via a pure recursive-descent parser.

### `copy-expense` — Duplicate an existing expense

Shipped. Spec: `.kiro/specs/copy-expense/`. Copy action on expense detail and
list cards opens the create form pre-filled with source data (today's date;
documents and recurrence excluded).

## 1. `server-authoritative-currency-conversion` — Automatic FX rates

- **Size:** Medium. **Upstream:** spliit #513/#425 and #514/#515.
- **Summary:** When an expense currency differs from the group currency, fetch the
  rate server-side (Frankfurter API) and store `originalAmount`/`originalCurrency`/
  `conversionRate` correctly (fix any cents/units mismatch). Balances use the converted amount.
- **Touch points:** `prisma/schema.prisma` (fields already exist: `originalAmount`,
  `originalCurrency`, `conversionRate`), conversion util in `src/lib/` (+ tests),
  create/update expense in `src/lib/api.ts` and the tRPC expenses router, expense form UI,
  CSV/JSON export routes (`.../expenses/export/*`).
- **Requirement seeds:**
  - WHEN an expense is saved in a currency other than the group currency, THE server SHALL resolve the conversion rate and persist original amount, original currency, and rate.
  - THE stored `originalAmount` SHALL use the same integer-cents convention as `amount`.
  - IF the FX provider is unavailable, THEN THE system SHALL let the user enter a manual rate and SHALL not block saving.

## 2. `multi-payer-expenses` — One expense paid by several members

- **Size:** Large. **Upstream:** spliit #14 (top-demand).
- **Summary:** Support an expense funded by multiple payers, each with an amount/share,
  instead of the current single `paidById`. This is the biggest functional gap vs Splitwise.
- **Touch points:** `prisma/schema.prisma` (new `ExpensePaidBy` join table `{expenseId,
userId, amount|shares}`; migrate existing single-payer rows), balance math in
  `src/lib/settlements.ts` / balances modules (+ property tests), expense form (payer
  section becomes multi-select with amounts), tRPC expenses router, import/export,
  activity diff (`src/lib/activity-diff.ts`).
- **Requirement seeds:**
  - WHEN creating/editing an expense, THE form SHALL allow selecting one or more payers with a per-payer amount that sums to the total.
  - THE balance calculation SHALL credit each payer by their contributed amount.
  - WHEN migrating existing data, THE migration SHALL convert every current `paidById` into a single-payer row with the full amount (no balance change).

## 3. `itemized-expenses` — Split by line items (with tax & tip)

- **Size:** Large. **Upstream:** spliit #395.
- **Summary:** Optionally break an expense into line items, assign each item to
  participants, and distribute tax/tip proportionally, producing per-person subtotals.
  Pairs well with the existing OpenAI receipt scan.
- **Touch points:** `prisma/schema.prisma` (new `ExpenseItem` + item↔participant links),
  split computation in `src/lib/` (+ property tests for money exactness), expense form
  (itemized mode UI), receipt-extract flow to prefill items, export.
- **Requirement seeds:**
  - WHEN itemized mode is enabled, THE user SHALL add items (title, amount) and assign each to one or more participants.
  - THE system SHALL distribute tax and tip proportionally to each participant's item subtotal.
  - THE sum of per-person shares SHALL exactly equal the expense total (no lost cents).

## 4. `account-overview-homepage` — Cross-group balance roll-up

- **Size:** Medium. **Upstream:** spliit #509.
- **Summary:** A logged-in landing page summarising the user's net position across all
  groups and friends (total owed / owing), with quick links.
- **Touch points:** new route under `src/app/` (e.g. an overview at `/` or `/overview`),
  a tRPC aggregation procedure reusing balance/friend-balance modules
  (`src/lib/friend-balances-db.ts`, settlement/balance utils), `messages/*` strings.
- **Requirement seeds:**
  - WHEN a logged-in user opens the overview, THE page SHALL show total net balance aggregated across groups and direct friends.
  - THE overview SHALL list top balances with links to each group/friend.
  - THE aggregation SHALL run server-side via a single tRPC procedure.

## 5. `profile-avatars` — Account profile photos

- **Size:** Medium.
- **Summary:** Let users upload an avatar shown across account, group member lists, and
  expense rows. Reuse the existing S3 upload infra.
- **Touch points:** `prisma/schema.prisma` (`User.image` field), S3 upload routes
  (`src/app/api/s3-upload/*`), profile settings (`src/app/settings`, profile router
  `src/trpc/routers/profile/index.ts`), member/expense UI components, `next.config.mjs`
  image domains if needed.
- **Requirement seeds:**
  - WHEN a user uploads an avatar, THE system SHALL store it via the existing S3 flow and persist its URL on the user.
  - THE avatar SHALL render (with initials fallback) in account, group member, and expense contexts.
  - WHEN no avatar is set, THE UI SHALL show an initials-based placeholder.
