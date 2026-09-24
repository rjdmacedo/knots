# Design Document

> **Reading order.** Sections 1–8 below describe the v1.0 design (the shipped
> pure splitter, `BY_AMOUNT` collapse, currency conversion, persistence, form,
> receipt prefill, export). The **v1.1 Design Amendment** at the end of this
> document decides everything the amended requirements (12–19) left open —
> the authoritative marker, the "Other" remainder storage, the tax/tip UI
> decision, the documentation-vs-authoritative gate, the FX bugfix, and the
> R14/R15 phasing — and, where it conflicts with v1.0, **the v1.1 amendment
> wins**. Read the amendment as the current design; the v1.0 sections remain
> for rationale and for the parts that are unchanged.

## Overview

Itemized expenses let a user optionally break one expense into line items, assign each item to one or more participants, and distribute a shared "Other" remainder (tax, tip, service) across participants. The result is a set of per-participant amounts in integer minor units whose sum equals the expense total exactly.

The central design decision — already fixed in the requirements — is that itemization is **not a new split mode and not a new balance path**. The itemized editor computes exact per-participant minor-unit amounts and collapses them into the existing `BY_AMOUNT` representation: `paidFor[].shares` become the computed per-participant amounts. Every downstream consumer already speaks `BY_AMOUNT`:

- `computeDecompositionSlots` / `decomposeExpense` (`src/lib/decompose-expense.ts`) read `BY_AMOUNT` shares directly as minor-unit amounts, so a non-member with a line is decomposed exactly as a non-member with a `BY_AMOUNT` share is today (Requirement 7).
- The multi-payer `ExpensePaidBy` handling in `createExpense` / `updateExpense` (`src/lib/api.ts`) is untouched: "who paid" stays independent of the computed shares (Requirement 7).
- Server-authoritative currency conversion (`resolveConversion` in `src/trpc/routers/groups/expenses/resolve-conversion.ts`) already recomputes the group-currency total before persistence. The design converts the per-participant amounts against that same total so the sum stays exact after conversion (Requirement 11).
- CSV and JSON export already emit `BY_AMOUNT` via `paidFor.shares` with no special handling (Requirement 10).

New surface area is therefore small: an `ExpenseItem` model plus an item↔participant link, a pure `Item_Splitter` module in `src/lib/` with property tests, an optional itemized section in the expense form that produces the `BY_AMOUNT` `paidFor` array, itemization fields threaded through the create/update procedures for persistence and reload, and an optional receipt prefill.

This document pins down the two computations the requirements called out explicitly: how tax/tip remainder cents are assigned, and how per-participant amounts are converted so their sum equals the converted total.

## Architecture

### Data flow (create / update, itemized mode on)

```
Expense_Form (itemized section)
  items[]        : { title, amount(major), assignedParticipantIds[] }
  taxAmount      : major
  tipAmount      : major
        │
        │  computeItemizedShares()  (pure, src/lib/itemized-split.ts)
        ▼
  perParticipant : Map<participantId, minorUnits>   // Item_Subtotal + tax slice + tip slice
        │
        │  collapse into existing form shape
        ▼
  ExpenseFormValues
    splitMode = 'BY_AMOUNT'
    amount    = sum(items)+tax+tip           (Entry_Currency major, as today)
    paidFor[] = [{ participant, shares: perParticipantMajor }]
    itemization = { enabled, items[], taxAmount, tipAmount }   // NEW, carried alongside
        │
        ▼
  tRPC create/update.procedure.ts
    resolveConversion(...) → overrides amount (group-currency minor units) as today
    convert paidFor shares against the same total  (Requirement 11)   ← NEW step
        │
        ▼
  createExpense / updateExpense (src/lib/api.ts)
    - persists Expense + ExpensePaidFor(shares) + ExpensePaidBy(payers) as today
    - persists ExpenseItem rows + item→participant links                ← NEW
    - non-member branch: decomposeExpense() consumes BY_AMOUNT shares  (unchanged)
```

The pure splitter runs **on the client** to drive the read-only total and the live preview, and the same function is the single source of truth for the per-participant amounts submitted. It is not re-run server-side on those amounts; the server trusts the submitted `BY_AMOUNT` shares exactly as it trusts a manually entered `BY_AMOUNT` split today, and re-validates their sum in `expenseFormSchema.superRefine` (the existing `amountSum` check).

### Where the money lives, and in which currency

The itemized editor operates entirely in the **Entry_Currency** (the currency the user types in, which may equal the Group_Currency). Item amounts, tax, and tip sum to the Entry_Currency total. This mirrors today's form, where `amount` and per-participant `BY_AMOUNT` shares are entered in the group currency and only the total is reconciled server-side.

Two cases:

- **Entry_Currency == Group_Currency** (the common case): the splitter's minor-unit outputs are already group-currency amounts. The `BY_AMOUNT` shares equal them directly. Cent-exactness holds by construction of the splitter (see below).
- **Entry_Currency != Group_Currency**: the server converts the total via `convertAmount` as it does today, then the per-participant amounts must be re-derived from the **converted** total so their sum equals it exactly. Converting each participant amount independently would drift, so we distribute the converted total across participants by their pre-conversion weights using the existing remainder-safe distributor (see "Currency conversion of shares").

## Components and Interfaces

### 1. Prisma schema — `ExpenseItem` and item→participant link

Add to `prisma/schema.prisma`:

```prisma
model ExpenseItem {
  id           String                 @id
  expense      Expense                @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  expenseId    String
  title        String
  amount       Int                    // Entry_Currency minor units (the currency the expense was entered in)
  position     Int                    // preserves display / remainder order
  assignments  ExpenseItemAssignment[]

  @@index([expenseId])
}

model ExpenseItemAssignment {
  item     ExpenseItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  itemId   String
  user     User        @relation("UserExpenseItemAssignments", fields: [userId], references: [id], onDelete: Cascade)
  userId   String

  @@id([itemId, userId])
  @@index([userId])
}
```

And, on `Expense`, the items back-relation plus two nullable integer columns for tax and tip in the Entry_Currency:

```prisma
items      ExpenseItem[]
taxAmount  Int?          // Entry_Currency minor units; null when not itemized / no tax
tipAmount  Int?          // Entry_Currency minor units; null when not itemized / no tip
```

Plus the matching back-relation on `User` (`expenseItemAssignments ExpenseItemAssignment[] @relation("UserExpenseItemAssignments")`).

Why tax and tip need their own columns: the authoritative Group_Currency split lives in `ExpensePaidFor.shares`, which already folds tax and tip into each participant's amount. That folded amount cannot be decomposed back into "subtotal vs tax vs tip", so restoring the editor on edit (Requirement 1.4) and reconstructing the itemization in the JSON export (Requirement 10.2) both require the original tax and tip to be stored explicitly. They are stored in the **Entry_Currency**, in the same minor units as `ExpenseItem.amount`, so `sum(items) + taxAmount + tipAmount` reproduces the Entry_Currency total the user typed — the same relationship `originalAmount` has to the group-currency `amount`. They are `null` for non-itemized expenses (and for decomposed halves, which carry no items).

Design notes:

- **`ExpenseItem.amount`, `Expense.taxAmount`, and `Expense.tipAmount` are all stored in the Entry_Currency**, not the Group_Currency. This keeps the itemization as the user typed it (so the edit screen shows their exact input, never a rounded-back conversion) and lets the JSON export reconstruct the itemization faithfully (Requirement 1.4, 10.2). The authoritative Group_Currency split lives, as today, in `ExpensePaidFor.shares` on the `BY_AMOUNT` expense. This intentionally accepts a small redundancy (items + tax + tip in entry currency, shares in group currency) rather than a new balance path — the same redundancy `originalAmount` already has with `amount`.
- **`position`** makes the `paidFor` participant order and the shared-item remainder order deterministic and stable across reloads (Requirement 3.3 relies on "current `paidFor` order").
- **Itemized iff at least one `ExpenseItem` exists.** There is no boolean "is itemized" column; the persisted state cannot disagree with itself (Requirement 1.7). The form's `itemized` toggle is a UI-level flag reconstructed on load as `items.length > 0`. Disabling the toggle and saving deletes all `ExpenseItem` rows and clears `taxAmount` / `tipAmount` to `null` (Requirement 1.6), which is a plain cascade of "no items submitted" in the update path. `taxAmount` / `tipAmount` are only ever non-null together with items.
- **Reimbursements and decomposed direct-halves never carry items.** Direct halves are created by `decomposeExpense` and are `BY_AMOUNT` with a single participant; they hold no items. The group-half also holds no items (items are an editor concept, and the group-half is a computed artifact). Only the top-level user-facing expense may carry items — and only before decomposition. See "Non-member interaction" for why this is acceptable for a first version.

### 2. Pure splitter — `src/lib/itemized-split.ts`

A pure, dependency-light module next to `distribute-amount.ts`, covered by property tests.

```ts
export interface ItemizedItem {
  amountMinor: number          // Item_Amount in minor units (Entry_Currency)
  assignedParticipantIds: string[]
}

export interface ItemizedInput {
  participantIdsInOrder: string[]   // the paidFor order; defines remainder recipients
  items: ItemizedItem[]
  taxMinor: number
  tipMinor: number
}

export interface ItemizedResult {
  // one entry per participant, in participantIdsInOrder; minor units
  perParticipant: Array<{ participantId: string; amountMinor: number }>
  totalMinor: number                // sum(items) + tax + tip
}

export function computeItemizedShares(input: ItemizedInput): ItemizedResult
```

Algorithm (all integer minor-unit arithmetic; the splitter's inputs and outputs are minor units throughout):

1. **Per-item split.** For each item, divide `amountMinor` equally among its `assignedParticipantIds`, computed directly in minor units: `base = floor(amountMinor / k)`, and the first `amountMinor - base*k` participants (in `participantIdsInOrder`) get one extra minor unit. This is the `distributeEqualAmounts` *policy* (remainder to earliest indices) done inline in minor units — the helper itself takes a major-unit total and returns major units, so it is not called here directly. Accumulate into each participant's `Item_Subtotal`. Sum of per-item allocations equals the item amount exactly (Requirement 3.3).
2. **Item_Subtotal.** Each participant's subtotal is the sum of their allocations across all items (Requirement 3.4).
3. **Tax and tip distribution.** Distribute `taxMinor` and `tipMinor` **separately**, each proportional to `Item_Subtotal`, using the remainder policy described in "Tax and tip remainder policy" — computed directly in minor units. Distributing them separately (rather than as one combined pool) means each of tax and tip individually sums exactly to its input, which the requirements state as two distinct guarantees (Requirement 4.2, 4.3, 4.5).
4. **Participant_Share.** `Item_Subtotal + taxSlice + tipSlice` (Requirement 4.6).
5. **Zero-subtotal fallback.** If every `Item_Subtotal` is 0 but tax or tip is > 0, distribute that charge **equally** across the assigned participants (equal-split policy, minor units) instead of dividing by zero (Requirement 4.4). "Assigned participants" here means the union of everyone assigned to at least one item; if no item has any assignment the editor is invalid and never reaches the splitter (Requirement 8.1).

Units note: `distributeEqualAmounts` and `distributeWeightedAmounts` in `distribute-amount.ts` accept a **major-unit** total and return **major-unit** values (each result is `minor / factor`). The `Item_Splitter` works in minor units end to end, so it applies their *remainder policies* inline rather than calling them on minor-unit inputs. The one place a distributor helper is called directly is the currency conversion of shares (Section 3), where the total is genuinely in major units and the result is re-multiplied by the factor back to minor units.

The function asserts (in tests, and defensively) that `sum(perParticipant.amountMinor) === totalMinor` (Requirement 5.1).

#### Tax and tip remainder policy (pinned by Requirement 4.5)

Tax and tip are each distributed with a **proportional-by-subtotal** rule that applies the exact remainder policy of `distributeWeightedAmounts` (`src/lib/distribute-amount.ts`), but computed directly in minor units inside the splitter (the helper works in major units, so its policy is reused, not the helper itself — see the units note above):

- Charge and subtotals are all in minor units.
- Raw slice for participant `i` = `chargeMinor * subtotal_i / sumOfSubtotals` (real number).
- Floor each slice to a whole minor unit.
- The leftover `chargeMinor - sum(floors)` minor units are handed out **one at a time to the participants with the largest fractional part first**; ties break by earlier position in `participantIdsInOrder`.

This is deliberately the same policy the codebase already uses for weighted distribution (`BY_SHARES` / `BY_PERCENTAGE` decomposition), so behaviour is consistent and already property-tested at the primitive level. The equal-split of a single shared **item** (step 1) instead uses the `distributeEqualAmounts` policy (remainder to earliest indices), matching Requirement 3.3's explicit "earliest in `paidFor` order" wording. The two policies differ only in tie-handling and are applied to different concerns (equal item split vs. proportional charge), exactly as the two existing distributors differ today.

To keep the grand total exact, the splitter does **not** independently round three pools and hope they sum. Instead:

- `sum(Item_Subtotals) == sum(all item amounts)` exactly (each item's split is exact).
- `sum(tax slices) == taxMinor` exactly (weighted distributor is exact).
- `sum(tip slices) == tipMinor` exactly.
- Therefore `sum(Participant_Shares) == sum(items) + tax + tip == totalMinor` exactly. No separate final reconciliation pass is needed.

### 3. Currency conversion of shares (pinned by Requirement 11)

Conversion is server-side and total-first, exactly as today. The itemized path adds one step in the create/update procedures, after `resolveConversion` produces the converted group-currency `amount`:

- **When no conversion happens** (`resolveConversion` passthrough — Entry_Currency equals Group_Currency or is blank): the submitted `paidFor` shares are already group-currency minor units. Nothing to do; their sum already equals `amount` (Requirement 11.2).
- **When conversion happens**: `resolveConversion` returns the converted total `amount` (group-currency minor units). We must produce per-participant group-currency amounts that sum to that converted total exactly (Requirement 11.4). We do this with the existing remainder-safe weighted distributor, being careful with units: `distributeWeightedAmounts` takes a **major-unit** total and returns **major-unit** values, so we convert the total to major units on the way in and multiply each result back to minor units on the way out.

  ```
  const groupDigits = getDecimalDigits(groupCurrencyCode)
  const factor = 10 ** groupDigits

  // convertedTotalMinor = resolveConversion(...).amount   (group-currency minor units)
  const convertedSharesMajor = distributeWeightedAmounts(
    convertedTotalMinor / factor,    // major-unit total the helper expects
    preConversionShareWeights,       // each participant's Entry_Currency Participant_Share (minor units) as weight
    groupDigits,
  )                                  // returns MAJOR units (minor / factor)

  const convertedSharesMinor = convertedSharesMajor.map((m) => Math.round(m * factor))
  ```

  Because `distributeWeightedAmounts` distributes the *given total* by weights and assigns leftover minor units deterministically, `sum(convertedSharesMinor) === convertedTotalMinor` by construction — no cent is lost or gained through per-participant rounding (Requirement 11.4). The weights are the participants' Entry_Currency shares (weights are unitless, so passing them in minor units is fine — only their ratios matter), so each person's converted amount is proportional to what they consumed. The `convertedSharesMinor` values are what get written to `paidFor[].shares`.

  These `convertedShares` replace `paidFor[].shares` before `createExpense` / `updateExpense` persists them, so the persisted `BY_AMOUNT` split is in the Group_Currency (Requirement 11.3). `ExpenseItem.amount` stays in the Entry_Currency (Requirement 11.1, 11.6). The existing `originalAmount` / `originalCurrency` / `conversionRate` columns continue to describe the total (Requirement 11.5), unchanged.

This mirrors the existing server-authoritative model: the client's per-participant amounts are a preview; the server recomputes the authoritative group-currency shares from the authoritative converted total.

### 4. Form schema — `src/lib/schemas.ts`

Extend `expenseFormSchema` with an optional `itemization` object:

```ts
itemization: z
  .object({
    enabled: z.boolean(),
    items: z.array(
      z.object({
        title: z.string().min(1, 'itemTitleRequired'),
        amount: z.union([z.number(), z.string().transform(expressionToNumber)])
          .refine((a) => a >= 0, 'itemAmountNonNegative'),
        assignedParticipants: z.array(z.string()).min(1, 'itemNeedsAssignment'),
      }),
    ),
    taxAmount: z.union([z.number(), z.string().transform(expressionToNumber)])
      .refine((a) => a >= 0, 'taxNonNegative').default(0),
    tipAmount: z.union([z.number(), z.string().transform(expressionToNumber)])
      .refine((a) => a >= 0, 'tipNonNegative').default(0),
  })
  .optional()
```

Reuses `expressionToNumber` so item/tax/tip fields accept arithmetic expressions like the main amount (Requirement 2.2). The existing `.superRefine` gains itemized rules; the existing `BY_AMOUNT` `amountSum` check already guarantees the shares sum to the total, so cent-exactness is validated by machinery already present.

`superRefine` additions (Requirement 8):

- If `itemization?.enabled` is true: require `items.length >= 1` (`itemsRequired`, Requirement 8.4); require every item's `assignedParticipants` to be non-empty (`itemNeedsAssignment`, Requirement 8.1) and to reference only current `paidFor` participants (`itemAssignmentUnknownParticipant`, Requirement 8.5); require the computed total (`sum(items)+tax+tip`) to match `amount` (this is enforced structurally because the form derives `amount` from the items — see form component).
- If a reimbursement or a non-`NONE` recurrence is set, `itemization.enabled` must be false (`itemizationNotAllowedHere`, Requirement 1.8).

The `.transform` step, when `itemization.enabled`, sets `splitMode = 'BY_AMOUNT'` and drops participants with a zero Participant_Share from `paidFor` (the "zero share → out of `paidFor`" behaviour deferred from requirements to design). Participants keep the `paidFor` order for deterministic remainders.

**Single-conversion rule (avoids double-multiplying by the factor).** The itemized `paidFor` shares are converted to minor units in exactly **one** place: `proceedWithSubmit` in the form component (Section 5), matching how `BY_AMOUNT` works today (the schema `.transform` leaves `BY_AMOUNT` shares as major-unit `Number(shares)`, and only `proceedWithSubmit` calls `amountAsMinorUnits`). Therefore:

- The schema `.transform` does **not** compute or write per-participant amounts and does **not** convert to minor units. It only flips `splitMode` to `BY_AMOUNT` and removes zero-share participants (defensive backstop), leaving `paidFor` in the same major-unit shape the rest of the form expects.
- **Where zero-share participants actually leave `paidFor`:** the legacy `paidFor` field validation rejects `shares <= 0` (`noZeroShares`), and that runs before the top-level `.transform`. So a zero-share participant must never be *submitted*. `proceedWithSubmit` builds `paidFor` from the splitter output and omits any participant whose computed Participant_Share is 0. The transform's zero-filter is therefore a backstop, not the primary mechanism — the primary drop happens in the form component when it constructs `paidFor`.
- `proceedWithSubmit` runs `computeItemizedShares` once on minor-unit inputs and writes the resulting per-participant **minor-unit** amounts into `paidFor[].shares`, using the **Entry_Currency** decimal digits — the original currency's digits when a conversion is required, the group currency's digits when it is not. This is the single minor-unit conversion for itemized shares.
- The server (Section 3 / Task 5.1) only *re-distributes* those already-minor shares across the converted total, and only when a conversion actually happens. It never multiplies by the factor again.

### 5. Expense form component — `src/app/groups/[groupId]/expenses/expense-form.tsx`

- **Itemized toggle** in the split section. When on, it reveals an items editor (title + amount inputs, a participant multi-select per item) and optional tax/tip inputs (Requirement 1.3). When off, the form is exactly as today (Requirement 1.2, 6).
- **Derived total.** With itemization on, the main amount field becomes **read-only** and is set to `sum(items)+tax+tip` (Requirement 8.2; read-only total deferred from requirements to design). This structurally removes the possibility of a conflicting manually entered total.
- **Live per-participant preview** using `computeItemizedShares`, reusing the existing per-participant amount display used by `BY_AMOUNT`. The existing live decomposition banner (`computeDecompositionSlots` preview) keeps working because it reads the derived `BY_AMOUNT` `paidFor`.
- **Toggle off discards items.** Turning itemization off clears the `itemization.items` in form state so no items are submitted; on save this deletes any persisted `ExpenseItem` rows (Requirement 1.6).
- **Submission** (`proceedWithSubmit`): when itemization is on, this is the **single** place itemized shares become minor units. Convert item/tax/tip inputs to minor units via `amountAsMinorUnits` using the **Entry_Currency** decimal digits (the original currency when a conversion is required, the group currency when it is not — mirroring how the existing code picks digits for `originalAmount` vs `amount`). Run `computeItemizedShares` once on those minor-unit inputs, write the resulting per-participant **minor-unit** amounts into `paidFor[].shares` as `BY_AMOUNT`, and pass the `itemization` object (items + tax/tip in Entry_Currency minor units) through to the mutation. The schema `.transform` has already set `splitMode = 'BY_AMOUNT'` and dropped zero-share participants, so `proceedWithSubmit` must not convert again.
- **Availability gating**: the toggle is hidden when the form is a reimbursement/payment or when a recurrence rule other than `NONE` is selected (Requirement 1.8).

### 6. Persistence — `src/lib/api.ts`

`createExpense` and `updateExpense` gain item persistence alongside the existing writes:

- **Create**: after the existing `expense.create` (regular path), create `ExpenseItem` rows and their `ExpenseItemAssignment` links from the submitted `itemization.items`, with `position` = array index, and set `Expense.taxAmount` / `tipAmount` from the submitted Entry_Currency tax and tip. Items and tax/tip are written only on the regular (non-decomposed) path.
- **Update**: replace items wholesale — delete existing `ExpenseItem` rows for the expense and recreate from the submitted list (cascade deletes assignments), and overwrite `taxAmount` / `tipAmount`. If `itemization` is absent/disabled or has no items, delete all item rows and set `taxAmount` / `tipAmount` to `null` (Requirement 1.6). This mirrors the existing full-replace strategy used for `payers`.
- **Currency**: apply the share-conversion step (Section 3) in the tRPC procedures before calling these functions, so `paidFor` shares are already group-currency minor units by the time they are persisted — no change to how `api.ts` writes shares.

#### Non-member interaction (Requirement 7)

When the top-level expense has items **and** includes non-members in `paidFor`, the flow is:

1. The form collapses items into `BY_AMOUNT` `paidFor` shares (per-participant Group_Currency minor amounts), including any non-member's computed share.
2. `createExpense` / `updateExpense` detect non-members and route into `decomposeExpense` exactly as today. `computeDecompositionSlots` reads the `BY_AMOUNT` shares directly, so the non-member's line-derived share becomes their Direct_Half amount, and members' shares become the Group_Half (Requirement 7.3, 7.4).
3. **Items are not persisted on decomposed expenses** in this first version: the Group_Half and Direct_Halves are computed `BY_AMOUNT` artifacts. The itemization detail is only meaningful on a non-decomposed expense. This is a conscious first-version scope limit consistent with the requirements (which require the *decomposition to still happen and the shares to be exact*, not that items be reattached to each half). The single-payer / no-recurrence / no-reimbursement preconditions of `decomposeExpense` already hold because itemization is unavailable for reimbursements and recurrence, and the existing "non-members ⇒ single payer" guard remains in force.

Payers are never derived from items: `ExpensePaidBy` continues to be set independently from the form's "Paid by" section (Requirement 7.1, 7.2, 7.5).

### 7. Receipt prefill — `create-from-receipt-button-actions.ts`

Optional and additive (Requirement 9):

- Extend `extractExpenseInformationFromImage` to *optionally* return a `items?: Array<{ title: string; amount: number }>` field in addition to today's amount/category/date/title. The prompt asks the model to also list line items when clearly present.
- The form, when it receives suggested items, enables itemization and prefills the items editor with them as **editable** rows (Requirement 9.3). It does **not** auto-assign participants (Requirement 9.5).
- If the extractor is not configured, errors, or returns no items, the form silently continues to work for manual itemization (Requirement 9.1, 9.4). Manual itemization never requires a scan.

### 8. Export

No code change is required for the primary case (Requirement 10.1): itemized expenses are stored as `BY_AMOUNT`, and both exports already emit `BY_AMOUNT` per-participant amounts via `paidFor.shares`.

For the JSON export only (Requirement 10.2): include the expense's `items` (each with title, Entry_Currency `amount`, and its assigned participant IDs) plus the expense's Entry_Currency `taxAmount` / `tipAmount`, so the itemization can be reconstructed. These are additive fields on the JSON export selection; the CSV export is unchanged. Non-itemized expenses (where `items` is empty and `taxAmount` / `tipAmount` are `null`) produce output equivalent to today (Requirement 10.3).

## Data Models

Summary of new persistence:

- `ExpenseItem` — one row per line item: `{ id, expenseId, title, amount (Entry_Currency minor units), position }`, cascade-deleted with the expense.
- `ExpenseItemAssignment` — join of item↔participant: `{ itemId, userId }`, composite PK, cascade-deleted with the item.
- `Expense.taxAmount` / `Expense.tipAmount` — two nullable integers in Entry_Currency minor units; non-null only for itemized expenses, so tax and tip can be restored on edit and reconstructed in JSON export.
- No boolean "is itemized" column; itemized state is derived from `items.length > 0`.
- `ExpensePaidFor.shares` continues to hold the authoritative Group_Currency per-participant amount (subtotal + tax slice + tip slice) under `splitMode = 'BY_AMOUNT'`.

## Error Handling

- **Validation** is centralized in `expenseFormSchema.superRefine` (missing item title, negative amount, unassigned item, assignment to a non-participant, empty item list while itemized, itemization on a reimbursement/recurring expense). Messages are new i18n keys in `messages/en-US.json`; other locales fall back to English until translated. On failure the form retains all entered items, assignments, tax and tip (Requirement 8.6) — standard react-hook-form behaviour since nothing is cleared on invalid submit.
- **Server** re-validates the `BY_AMOUNT` sum via the existing `amountSum` refinement, so a malformed client submission cannot persist an inexact split.
- **Currency conversion failure** is handled by the existing `resolveConversion` path (falls back to a client-provided rate, else `PRECONDITION_FAILED`); the added share-distribution step runs only after a successful conversion, so it cannot introduce new failure modes.
- **Decomposition preconditions** are already guarded in `api.ts`; itemization does not relax them.

## Testing Strategy

- **Property tests** for `computeItemizedShares` in `src/lib/__tests__/itemized-split.property.test.ts`, using `fast-check` with ≥100 runs, matching the style of `decompose-expense.property.test.ts`:
  - Cent-exactness: for random items, assignments, tax and tip, `sum(perParticipant) === totalMinor` (Requirement 5.1, 5.3).
  - Each shared item's allocations sum to the item amount (Requirement 3.3).
  - Tax and tip each sum exactly to their inputs (Requirement 4.2, 4.3, 4.5).
  - Zero-subtotal-with-tax/tip falls back to an equal split and stays exact (Requirement 4.4).
  - Proportionality: a participant with a larger subtotal never receives a smaller tax/tip slice (monotonicity) — sanity property.
- **Conversion exactness** unit tests: converting the total via `convertAmount` and distributing via `distributeWeightedAmounts` yields shares summing to the converted total across a matrix of currencies (2-digit and 0-digit like JPY) and rates (Requirement 11.4).
- **Schema tests** in `schemas.test.ts`: itemized validation rules (unassigned item, negative amounts, empty items, itemization blocked for reimbursement/recurrence) and the transform that collapses items into `BY_AMOUNT` `paidFor` dropping zero-share participants.
- **Non-member integration**: an itemized expense assigning a line to a non-member decomposes into the same Group_Half + Direct_Half structure as an equivalent `BY_AMOUNT` expense (Requirement 7.3, 7.4), reusing existing decomposition tests as the oracle.
- **Persistence round-trip**: create → reload restores itemized mode, items, assignments, tax and tip (Requirement 1.4); disabling itemization deletes item rows (Requirement 1.6).

## Open Decisions Deferred to Implementation

These follow from the requirements and are noted for the task breakdown, not re-opened here:

- Participants with a zero Participant_Share are dropped from `paidFor` (leave the split) — implemented in the schema transform.
- The main amount field is read-only while itemized — implemented in the form component.
- Copying an expense (existing copy-expense feature) does not copy items in this first version; the copy opens with itemization off. This keeps the copy flow unchanged and avoids re-deriving items across currencies.
---

# v1.1 Design Amendment (Requirements 12–19)

This amendment is the **current design**. It decides everything the amended
requirements left open and, where it conflicts with the v1.0 sections above,
supersedes them. Nothing here changes the hard constraint: authoritative
itemization is always persisted and computed as `BY_AMOUNT` `paidFor.shares`;
there is no `SplitMode.ITEMIZED` and balances are never re-derived from items at
read time.

## A. Decisions on the open questions

The requirements explicitly left three things to design. Decided:

1. **Marker column name.** `Expense.itemsAuthoritative Boolean @default(false)`.
   This is the `Items_Authoritative_Marker`. `true` ⇒ items drive the split
   (`splitMode = BY_AMOUNT`, `paidFor` came from the splitter); `false` ⇒ any
   items present are `Documentation_Items` and the split is the persisted
   `Legacy_Split_Mode`. "Itemized" is read from this column, never from
   `items.length > 0` (this overturns the v1.0 "itemized iff items exist" rule
   in Section 1 / Data Models).

2. **Remainder storage shape.** A dedicated **column + mode on `Expense`**, plus
   a **small relation for the CUSTOM allocation**:
   - `Expense.remainderAmount Int?` — the `Item_Remainder` in Entry_Currency
     minor units (signed). `null` when the expense has no items.
   - `Expense.remainderAllocationMode RemainderAllocationMode?` — new enum
     `{ PROPORTIONAL, CUSTOM }`; `null` when no items.
   - `Expense.remainderSplitMode SplitMode?` — the flat split mode of the "Other"
     line when `remainderAllocationMode = CUSTOM` (EVENLY / BY_SHARES /
     BY_PERCENTAGE / BY_AMOUNT, never ITEMIZED); `null` for PROPORTIONAL and when
     no items. The split mode lives on the `Expense` (one per remainder), exactly
     as `Expense.splitMode` lives on the expense — not on each share row.
   - `ExpenseRemainderShare` — a relation used **only** when
     `remainderAllocationMode = CUSTOM`, holding the per-participant rows for the
     "Other" line: `{ expenseId, userId, shares }` — the same shape as
     `ExpensePaidFor` (a row is just a participant + polymorphic `shares`). For
     `PROPORTIONAL` this relation is empty (weights are the item subtotals,
     derived at compute time — nothing to store).
   The `remainderAmount` is the **source of truth** for the "Other" pool; it is
   what the JSON export emits and what the editor restores on reload
   (Requirement 16 glossary, R10.2).

3. **Tax/tip UI.** The two separate tax and tip fields are **removed in favour
   of a single "Other" line** (Cloud's model). There is one remainder pool with
   one allocation control. Tax and tip survive only as optional *quick-add*
   affordances inside the "Other" editor (two convenience inputs that sum into
   `remainderAmount`); they are never stored as independent columns. This
   retires `Expense.taxAmount` / `Expense.tipAmount` (see migration below).
   Rationale: R16 made the remainder the source of truth, and keeping two
   authoritative columns *and* a remainder would reintroduce exactly the
   dual-source ambiguity the reconciliation pass removed.

## B. Schema delta (supersedes Section 1 / Data Models)

Replace the v1.0 `taxAmount` / `tipAmount` columns with the marker and remainder
model. On `Expense`:

```prisma
// itemization (v1.1)
items                   ExpenseItem[]
itemsAuthoritative      Boolean                   @default(false)
remainderAmount         Int?                      // Entry_Currency minor units, signed; null when no items
remainderAllocationMode RemainderAllocationMode?  // null when no items
remainderSplitMode      SplitMode?                // CUSTOM only: flat split mode of the "Other" line; null otherwise
remainderShares         ExpenseRemainderShare[]   // only for CUSTOM allocation
// taxAmount / tipAmount  — REMOVED (folded into remainderAmount)
```

New enum and relation:

```prisma
enum RemainderAllocationMode {
  PROPORTIONAL
  CUSTOM
}

/// Per-participant rows for the "Other" remainder when allocation is CUSTOM.
/// Empty for PROPORTIONAL (weights are the item subtotals, computed on the fly).
/// Same shape as ExpensePaidFor: a participant + polymorphic `shares` whose
/// meaning follows Expense.remainderSplitMode. The split mode lives on the
/// Expense, not on each row.
model ExpenseRemainderShare {
  expense   Expense   @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  expenseId String
  user      User      @relation("UserExpenseRemainderShares", fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  shares    Int

  @@id([expenseId, userId])
  @@index([userId])
}
```

`ExpenseItem`, `ExpenseItemAssignment`, and the `User` back-relations are
unchanged from v1.0; add `expenseRemainderShares ExpenseRemainderShare[] @relation("UserExpenseRemainderShares")` on `User`.

### Migration

The v1.0 migration (`20260924141825_add_itemized_expenses`) already shipped
`taxAmount` / `tipAmount` in the working tree but the feature is unreleased, so
no production data depends on them. The v1.1 migration:

1. Adds `itemsAuthoritative` (default `false`), `remainderAmount`,
   `remainderAllocationMode`, the `RemainderAllocationMode` enum, and the
   `ExpenseRemainderShare` table.
2. **Backfills**: for any existing row with items, set
   `remainderAmount = coalesce(taxAmount,0) + coalesce(tipAmount,0)`,
   `remainderAllocationMode = 'PROPORTIONAL'`, and `itemsAuthoritative = true`
   (v1.0 stored items only when authoritative). In practice the dev database has
   no such rows; the backfill is written for safety and is a no-op on empty data.
3. Drops `taxAmount` and `tipAmount`.

Because the feature is unreleased this is a normal `prisma migrate dev`; there is
no phased column deprecation.

## C. Documentation vs authoritative gate (Requirements 12, 13)

### State model in the form

The form's itemization state gains an explicit authoritative flag mirroring the
column. `ExpenseFormValues.itemization` becomes:

```ts
itemization?: {
  authoritative: boolean            // was: enabled
  items: Array<{ title; amount; assignedParticipants[] }>
  remainder: {
    amount?: number                 // optional explicit override; usually derived as total − Σ items
    allocationMode: 'PROPORTIONAL' | 'CUSTOM'
    // CUSTOM only:
    splitMode?: SplitMode
    paidFor?: Array<{ participant; shares }>
  }
}
```

- **Documentation state** (`authoritative = false`): items may be present and
  edited; the active `splitMode` remains a `Legacy_Split_Mode`; `paidFor` is the
  legacy split and is **not** derived from items. The items editor is visible but
  a banner/affordance makes clear the items are documentation (Requirement 12.6).
- **Authoritative state** (`authoritative = true`): the splitter derives
  `paidFor`, `splitMode` is forced to `BY_AMOUNT`, and the `Legacy_Split_Mode`
  selector is hidden/disabled (Requirement 12.3).

### The gate

A single client-side helper decides whether an edit is "split-affecting":
editing an item's participants, editing the `All_Items_Split` (deferred — see
§G), or activating an explicit **"Use items as split"** control. When
`authoritative === false` and a split-affecting edit is attempted:

1. Show the `Switch_To_Itemized_Confirmation` dialog (shadcn `AlertDialog`,
   matching the existing duplicate/leave dialogs; Cloud's "Switch to itemised?").
2. On **confirm**: set `authoritative = true`, run the splitter, write the
   derived `paidFor` + `splitMode = BY_AMOUNT`, hide the legacy selector, and
   then apply the edit that triggered the gate (Requirement 12.3).
3. On **cancel**: leave `authoritative = false`, legacy split and items unchanged
   (Requirement 12.4).

Non-split-affecting edits (adding a line, typing a title/amount) never trip the
gate — they just update `Documentation_Items`.

### Leaving authoritative itemization (Requirement 13)

A "switch to a normal split" control (re-showing the legacy selector) triggers
the `Leave_Itemized_Confirmation` (Cloud's "Leave itemised"), naming the target
mode. On confirm: set `authoritative = false`, restore the chosen
`Legacy_Split_Mode` with a valid `paidFor` (default even split across current
participants), and **keep the items as `Documentation_Items`** — they are not
deleted (Requirement 13.4). Deleting items remains a separate explicit action.

### Persistence of the gate

`createExpense` / `updateExpense` (superseding Section 6):

- Persist `itemsAuthoritative` from the form flag.
- **Always persist items and the remainder when items exist**, regardless of the
  marker — so `Documentation_Items` round-trip (Requirement 13.5, 12.1). This is
  the key change from v1.0, where items were written only when itemized.
- When `itemsAuthoritative = false`: `paidFor` is the legacy split (items do not
  drive it); items + remainder are still written as documentation.
- When `itemsAuthoritative = true`: `paidFor` is the derived `BY_AMOUNT` split as
  in v1.0.
- Reload (`getExpense`) returns `items`, `itemsAuthoritative`, `remainderAmount`,
  `remainderAllocationMode`, and `remainderShares`; the form reconstructs the
  documentation-vs-authoritative state from the marker (not from item presence).

## D. The "Other" remainder in the splitter (Requirement 16)

`computeItemizedShares` is generalised from `(items, taxMinor, tipMinor)` to
`(items, remainder)`:

```ts
export interface ItemizedRemainder {
  amountMinor: number                       // signed; Expense_Total − Σ Item_Amount
  allocationMode: 'PROPORTIONAL' | 'CUSTOM'
  // CUSTOM only:
  splitMode?: SplitMode
  paidFor?: Array<{ participantId: string; shares: number }>
}

export interface ItemizedInput {
  participantIdsInOrder: string[]
  items: ItemizedItem[]
  remainder: ItemizedRemainder
}
```

Algorithm changes:

1. Per-item equal split and `Item_Subtotal` accumulation — **unchanged** from
   v1.0 §2 (each item split equally among its assignees; single-policy).
2. **Remainder distribution:**
   - `PROPORTIONAL`: distribute `remainder.amountMinor` in proportion to
     `Item_Subtotal` using the existing weighted-remainder policy (v1.0's
     "tax/tip remainder policy" — largest fractional part first). This *is* the
     old proportional tax+tip path, now over one pool. Zero-subtotal fallback
     (equal split across assigned participants) is unchanged (Requirement 16.3).
   - `CUSTOM`: distribute `remainder.amountMinor` by the flat split in
     `remainder.paidFor` / `remainder.splitMode`, reusing the same integer
     minor-unit distributor policies (`distributeEqualAmounts` for EVENLY,
     `distributeWeightedAmounts` for BY_SHARES / BY_PERCENTAGE; BY_AMOUNT rows
     are the amounts directly) — exactly as `computeDecompositionSlots` already
     interprets `paidFor` per `splitMode` (Requirement 16.4).
3. `Participant_Share = Item_Subtotal + remainderSlice`; the sum equals
   `Σ Item_Amount + remainder = Expense_Total` exactly (Requirement 16.5).

Backward compatibility: the tax/tip form shortcuts sum into
`remainder.amountMinor` with `allocationMode = PROPORTIONAL`, reproducing v1.0
behaviour bit-for-bit (Requirement 4 amended, 16.7). The existing property tests
keep passing under `PROPORTIONAL`; new property tests cover `CUSTOM` and the
signed/zero remainder cases.

The property tests generalise: cent-exactness across random items + random
remainder (both modes), remainder-slice-sums-to-remainder, and the
zero-subtotal fallback (Requirement 5.3, 16.5).

## E. Editable total + overshoot guard (Requirement 17, supersedes §5 read-only total)

The main amount field is **editable again** while items are present (this
reverses the v1.0 "read-only derived total" decision in Section 5 and the "Open
Decisions" note):

- The `Item_Remainder` is computed as `Expense_Total − Σ Item_Amount` and shown
  as the "Other" line (Requirement 16.1, 17.1).
- If `Σ Item_Amount` exceeds `Expense_Total` in the expense's sign direction
  (`itemsExceedExpenseAmount`, ported as a small pure helper — signed to allow
  negative/refund expenses), block save, show the error, and offer a **"set
  amount from items"** action that sets `amount = Σ Item_Amount` making the
  remainder zero (Requirement 17.2, 17.3).
- The overshoot check runs in `expenseFormSchema.superRefine` (a new
  `itemsExceedAmount` issue) and in the editor UI for the live warning.

## F. FX bugfix — Entry_Total is the editable `originalAmount` (Requirement 18)

This fixes the defect where the FX effect overwrote the itemized total. The
decision (Requirement 17.4 / 18.3): **with FX and authoritative itemization, the
editable total the user sees IS the Entry_Total, and it IS `originalAmount`;
`amount` is derived by conversion and is not independently editable.**

Concretely in the form:

- When `authoritative && conversionRequired`:
  - The single editable total field is bound to the Entry_Total in the
    Entry_Currency and written to `originalAmount` (Requirement 18.1).
  - `Item_Remainder = Entry_Total − Σ Item_Amount`, all in Entry_Currency minor
    units.
  - The existing FX effect that computes `amount = originalAmount × rate` is
    **guarded** so it does not run against / overwrite the itemized Entry_Total:
    the itemized path owns `originalAmount` (it is the composed
    `Σ Item_Amount + Item_Remainder`), and `amount` is the converted preview
    only. The server's `resolveConversion` remains authoritative for the stored
    `amount` (Requirement 18.2, 18.4).
  - `applyItemizedConversion` (server) is unchanged in spirit: after
    `resolveConversion` converts the Entry_Total, per-participant shares are
    re-derived from the converted total so they sum exactly (Requirement 18.4,
    unchanged from v1.0 §3).
- When Entry_Currency == Group_Currency: no `originalAmount`; the editable total
  is the Group_Currency total directly (Requirement 18.5) — unchanged.

This removes the v1.0 ambiguity (Section 5 said the total is read-only; the FX
effect then fought the derived total). The single-editable-Entry_Total rule is
now explicit.

## G. Phasing for this pass (Requirement 19)

**In scope this phase** (implemented now):

- Marker column + documentation/authoritative gate with both dialogs (§C).
- The single "Other" remainder pool with `PROPORTIONAL` and `CUSTOM` allocation,
  replacing the two tax/tip columns (§B, §D).
- Editable total + overshoot guard with "set amount from items" (§E).
- FX bugfix: Entry_Total = editable `originalAmount` (§F).

**Deferred to a later phase** (declared here per Requirement 19.2; named, not
dropped):

- **Requirement 14 — per-line `unitPrice × quantity`.** This phase keeps a single
  per-line `amount`. When implemented, `ExpenseItem` gains `unitPrice Int` and
  `quantity Int @default(1)` with `amount` recomputable from them; the splitter
  is unaffected (it already consumes `Item_Amount`).
- **Requirement 15 — `All_Items_Split` control.** This phase assigns participants
  per line (and the "Use items as split" control triggers the gate). The
  one-click "apply this split to every line" affordance and its "mixed" indicator
  are deferred. The gate already covers "editing the all-items split" as a
  trigger, so adding the control later does not change the gate contract.

**Out of scope (permanently, per Requirement 19.3):** per-line split *modes*
(each item EVENLY/BY_SHARES/…); Cloud's BigInt/exact-rational math. A Knots item
is split equally among its assignees; the remainder is the only place a flat
split mode applies (CUSTOM), and it reuses the existing integer distributors.

## H. Updated data-model summary (supersedes the v1.0 "Data Models" section)

- `ExpenseItem` — `{ id, expenseId, title, amount (Entry_Currency minor units),
  position }`, cascade-deleted with the expense. (Gains `unitPrice`/`quantity`
  only when Requirement 14 is implemented.)
- `ExpenseItemAssignment` — `{ itemId, userId }`, composite PK, cascade-deleted.
- `Expense.itemsAuthoritative Boolean` — the source of truth for "is itemized".
- `Expense.remainderAmount Int?` — the "Other" pool in Entry_Currency minor
  units (signed); source of truth for tax/tip/service. `null` when no items.
- `Expense.remainderAllocationMode RemainderAllocationMode?` — PROPORTIONAL or
  CUSTOM; `null` when no items.
- `Expense.remainderSplitMode SplitMode?` — CUSTOM-only flat split mode of the
  "Other" line (one per remainder, on the Expense); `null` otherwise.
- `ExpenseRemainderShare` — CUSTOM-only per-participant rows `{ expenseId, userId,
  shares }` for the remainder, same shape as `ExpensePaidFor`.
- `Expense.taxAmount` / `tipAmount` — **removed** (folded into `remainderAmount`).
- `ExpensePaidFor.shares` — unchanged: holds the authoritative Group_Currency
  per-participant amount (item subtotal + remainder slice) under
  `splitMode = 'BY_AMOUNT'` when `itemsAuthoritative = true`; holds the legacy
  split otherwise.

## I. Updated testing strategy (adds to the v1.0 strategy)

- Splitter property tests generalised to `(items, remainder)`: cent-exactness for
  both `PROPORTIONAL` and `CUSTOM`, remainder-slice exactness, signed/zero
  remainder, zero-subtotal fallback.
- Gate tests: a split-affecting edit while `authoritative = false` requires the
  confirmation; confirm flips to authoritative + derives `paidFor`; cancel is a
  no-op. Leaving authoritative keeps items as documentation.
- Persistence round-trip: `Documentation_Items` (marker `false`) survive save +
  reload without driving the split; authoritative items reload as authoritative;
  remainder amount + mode + CUSTOM shares round-trip; JSON export emits them
  (Requirement 10.2, 13.5).
- Overshoot guard: `Σ items > total` blocks save and "set amount from items"
  clears the remainder (Requirement 17.2, 17.3).
- FX: with authoritative itemization and a foreign Entry_Currency, `originalAmount`
  equals the composed Entry_Total, the FX effect does not clobber it, and the
  converted per-participant shares sum to the converted total (Requirement 18).

## Correctness Properties

These invariants hold across v1.0 and the v1.1 amendment and are the basis of the property/integration tests (§I).

### Property 1: Cent-exactness

For any items, assignments, and remainder (PROPORTIONAL or CUSTOM), `Σ Participant_Share == Expense_Total` exactly in integer minor units. No cent is lost or invented.

**Validates: Requirements 5.1, 16.5**

### Property 2: Remainder exactness

The distributed remainder slices sum exactly to `remainderAmount`; the item subtotals sum exactly to `Σ Item_Amount`; the two pools are summed, never independently rounded then reconciled after the fact.

**Validates: Requirements 16.5**

### Property 3: Conversion exactness

When Entry_Currency ≠ Group_Currency, the per-participant Group_Currency shares sum exactly to the server-converted total.

**Validates: Requirements 11.4, 18.4**

### Property 4: Authoritative marker consistency

`itemsAuthoritative = true ⇒ splitMode = BY_AMOUNT` and `paidFor` equals the splitter output; `itemsAuthoritative = false ⇒` the split is the persisted `Legacy_Split_Mode` regardless of item presence. "Itemized" is read only from the marker.

**Validates: Requirements 1.6, 1.7, 12.5**

### Property 5: Documentation round-trip

Items and remainder persist and reload identically whether or not they are authoritative; leaving authoritative keeps items as documentation rather than deleting them.

**Validates: Requirements 12.1, 13.4, 13.5**

### Property 6: No overshoot

A saved itemized expense never has `Σ Item_Amount` exceeding `Expense_Total` in the expense's sign direction; the remainder is the signed gap.

**Validates: Requirements 17.2**

### Property 7: Balance-path invariance

Balances, non-member decomposition, multi-payer, and export consume `BY_AMOUNT` `paidFor.shares` only; no `SplitMode.ITEMIZED`, no read-time re-derivation from items.

**Validates: Requirements 5.4, 7.5, 19.4**
