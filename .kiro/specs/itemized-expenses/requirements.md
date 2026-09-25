# Requirements Document

## Introduction

Itemized expenses let a user optionally break a single expense into individual line items (for example, the lines on a restaurant or grocery receipt), assign each item to one or more of the expense participants, and have shared charges — tax and tip — distributed proportionally to how much each participant consumed. The result is a per-person subtotal derived from the items each person is responsible for, plus their proportional slice of tax and tip.

Itemized mode is strictly optional and additive. An expense with no line items behaves exactly as it does today, using one of the existing split modes (EVENLY, BY_SHARES, BY_PERCENTAGE, BY_AMOUNT) and preserving today's multi-payer and non-member decomposition behaviour. When itemized mode is on, the per-item assignments become the source of how the expense is split, and the system computes an equivalent per-participant `BY_AMOUNT` breakdown so the rest of the app (balances, settlements, activity, export) continues to work without a new architecture. Crucially, "who paid" (the payers) stays independent of "who owes what" (the per-participant shares) in itemized mode exactly as in the legacy modes, and an itemized expense that includes non-members still triggers the existing non-member decomposition on the computed shares.

Itemized mode is scoped to normal, positive, non-recurring expenses. Reimbursements (negative/payment expenses) and recurring expenses do not fit this model and keep their current behaviour, with itemized mode unavailable for them.

The overriding correctness rule is monetary exactness: the sum of every participant's computed share, expressed in integer minor currency units, must equal the expense total in minor units exactly — no cent may be lost or invented.

This feature grounds in the existing repository: the Prisma schema (`prisma/schema.prisma`) gains an `ExpenseItem` model and item-to-participant links; the pure split/distribution logic lives in `src/lib/` (alongside `distribute-amount.ts`) with property tests for money exactness; the expense form (`src/lib/schemas.ts` `expenseFormSchema` and the form UI) gains an optional itemized mode; the existing receipt-extract flow (`extractExpenseInformationFromImage` in `create-from-receipt-button-actions.ts`) may optionally prefill items; and export (`src/app/groups/[groupId]/expenses/export/csv/route.ts` and the JSON export) reflects itemization when present.

**v1.1 UX alignment (Requirements 12–19).** After the initial requirements (1–11), this document was amended to align the product behaviour with the sibling fork `spliit-cloud`, while keeping the Knots architecture unchanged. The two behavioural shifts a reader should hold in mind: (a) Items may exist as _documentation_ alongside a legacy split mode, and only become the _authoritative_ split after an explicit "Switch to itemised?" confirmation — the term "Itemized*Mode is on" in Requirements 1–11 corresponds to the \_Authoritative_Itemization* state defined below; and (b) tax and tip are generalised into a single signed "Other" _Item_Remainder_ pool (`Expense_Total − Σ Item_Amount`) that can be split proportionally or with a custom flat split. Where a v1.1 requirement amends an earlier one, it says so explicitly. The hard constraint is unchanged throughout: authoritative itemization is always persisted and computed as `BY_AMOUNT` `paidFor.shares` — there is no `SplitMode.ITEMIZED` and balances are never re-derived from Items at read time.

## Glossary

- **Expense**: An existing expense record (`Expense` in `prisma/schema.prisma`) with a `title`, an integer `amount` in minor currency units, one or more payers, and a set of participants in `paidFor`.
- **Expense_Total**: The full monetary value of the Expense in integer minor currency units — the value persisted in `Expense.amount`. When itemization is authoritative it equals the sum of all Item_Amounts plus the Item_Remainder (see Requirement 16); the previously stated form "sum of Item_Amounts plus Tax_Amount plus Tip_Amount" is the special case where the Item_Remainder is composed only of tax and tip.
- **Minor_Units**: The smallest integer denomination of the expense currency (e.g. cents), consistent with the integer arithmetic used in `src/lib/distribute-amount.ts`. All exactness guarantees are stated in Minor_Units.
- **Participant**: A person who appears in the Expense's `paidFor` set. Participants may be group members or, in the non-member case, the people handled by the existing decomposition flow.
- **Itemized_Mode**: (Superseded terminology.) Requirements 1–11 use "Itemized_Mode is on" to mean the state in which Items drive the split. From the v1.1 amendment onward this state is named **Authoritative_Itemization** (see its glossary entry and Requirement 12); Items may also exist without driving the split, as Documentation_Items. Wherever Requirements 1–11 say "Itemized_Mode is on", read "Authoritative_Itemization"; wherever they say "itemized iff items exist", read the authoritative-marker rule of Requirements 1.6–1.7 as amended.
- **Item**: A single line of an Expense, identified within the Expense and having at least an Item_Title and an Item_Amount. Persisted via the new `ExpenseItem` model. An Item may be a Documentation_Item (present while a Legacy_Split_Mode is active) or part of an Authoritative_Itemization.
- **Item_Title**: A short human-readable label for an Item (for example "Burger", "Shared fries").
- **Item_Amount**: The monetary value of a single Item in Minor_Units, excluding the Item_Remainder. When per-line unit price and quantity are used (Requirement 14), `Item_Amount = Item_Unit_Price × Item_Quantity`.
- **Item_Assignment**: The link between an Item and the one or more Participants responsible for that Item. Persisted via an item-to-participant link on the new `ExpenseItem` model.
- **Item_Subtotal**: For a given Participant, the sum of their allocated portions across all Items assigned to them, in Minor_Units, excluding the Item_Remainder. An Item assigned to multiple Participants divides its Item_Amount among them.
- **Tax_Amount**: A UI-level shortcut (not a source of truth) for entering part of the Item_Remainder. When present it is a contribution to the Item_Remainder pool (Requirement 16.7), never a separately authoritative field.
- **Tip_Amount**: A UI-level shortcut (not a source of truth) for entering part of the Item_Remainder, on the same footing as Tax_Amount.
- **Participant_Share**: The final amount a Participant is responsible for in Minor_Units, equal to their Item_Subtotal plus their slice of the Item_Remainder (which, for a proportional remainder, is proportional to their Item_Subtotal — reproducing the earlier "proportional tax and tip" behaviour).
- **Item_Splitter**: The pure module in `src/lib/` that takes Items, Item_Assignments, and the Item_Remainder (with its Remainder_Allocation_Mode) and computes each Participant_Share in Minor_Units, guaranteeing the Cent_Exact_Invariant. It splits shared Items and distributes the Item_Remainder using the deterministic remainder rules of `src/lib/distribute-amount.ts`. (In Requirements 1–11 the same module is described in terms of Tax_Amount and Tip_Amount; those are the tax/tip special case of the Item_Remainder.)
- **Cent_Exact_Invariant**: The rule that the sum of all Participant_Shares in Minor_Units equals the Expense_Total in Minor_Units exactly.
- **Entry_Currency**: The currency the user enters the Expense in, which may differ from the Group_Currency. Today the Expense_Form allows a non-group currency and the server converts it.
- **Group_Currency**: The currency of the group (or direct-friend context) in which balances are held.
- **Currency_Conversion**: The existing server-authoritative conversion (`src/lib/currency-conversion.ts`) that converts an amount in the Entry_Currency to the Group_Currency in Minor_Units.
- **Payers**: The one or more people who funded the Expense, persisted via `ExpensePaidBy`. Independent of how the Expense is split.
- **Non_Member_Decomposition**: The existing behaviour (`src/lib/decompose-expense.ts`) that atomically splits a group Expense containing non-members in `paidFor` into a group half and per-non-member direct halves.
- **Expense_Form**: The form used to create or edit an Expense (`expenseFormSchema` in `src/lib/schemas.ts` and its UI), extended with an optional itemized mode.
- **Legacy_Split_Mode**: One of the existing split modes (EVENLY, BY_SHARES, BY_PERCENTAGE, BY_AMOUNT) used when Itemized_Mode is off.
- **Receipt_Extractor**: The existing AI receipt flow (`extractExpenseInformationFromImage`) that reads a receipt image; optionally extended to suggest Items as a prefill.

<!-- ─────────────────────────────────────────────────────────────────────── -->
<!-- v1.1 UX alignment glossary (see Requirements 12–17)                      -->
<!-- ─────────────────────────────────────────────────────────────────────── -->

- **Documentation_Items**: Items that exist on an Expense as receipt detail only, while the Expense is still split by its active Legacy_Split_Mode. Documentation_Items do NOT drive who owes what; they are informational until itemization becomes authoritative.
- **Authoritative_Itemization**: The state in which the Items (and the Item_Remainder) are the source of the Expense's split — the state this document previously called "Itemized_Mode is on". In this state the system derives the `BY_AMOUNT` `paidFor` from the Item_Splitter and the Legacy_Split_Mode selector is hidden/disabled. Authoritative_Itemization is NEVER a new `SplitMode` enum value: the persisted and computed split mode remains `BY_AMOUNT`, and balances are never re-derived from Items at read time.
- **Switch_To_Itemized_Confirmation**: A confirmation dialog (equivalent to Cloud's "Switch to itemised?") shown the first time a user action would turn Documentation_Items into Authoritative_Itemization.
- **Leave_Itemized_Confirmation**: A confirmation dialog (equivalent to Cloud's "Leave itemised") shown when the user leaves Authoritative_Itemization to return to a Legacy_Split_Mode.
- **Item_Quantity**: A positive integer count for an Item. `Item_Amount = Item_Unit_Price × Item_Quantity` in Minor_Units.
- **Item_Unit_Price**: The per-unit price of an Item in Minor_Units (Entry_Currency).
- **All_Items_Split**: A single default split (participants + a per-line split rule) that can be applied to every Item at once.
- **Item_Remainder**: The signed gap between the Expense_Total and the sum of all Item_Amounts, in Minor_Units (`Item_Remainder = Expense_Total − Σ Item_Amount`). It generalises Tax_Amount + Tip_Amount into one pool. A positive Item_Remainder represents shared charges not itemized (tax, tip, service); it is displayed as an "Other" line in the editor. **Persistence model (chosen):** the Item_Remainder is the source of truth, persisted as its own stored value in Entry_Currency Minor_Units together with its Remainder_Allocation_Mode (and, for CUSTOM, its flat-split participants/weights). Tax_Amount and Tip_Amount are UI shortcuts that add into this pool; the design chooses the concrete storage (a remainder column/relation), and any residual `taxAmount`/`tipAmount` storage is derived from or folded into the Item_Remainder rather than being independently authoritative. The Item_Remainder value stored is what the JSON export emits and what the editor restores on reload.
- **Remainder_Allocation_Mode**: How the Item_Remainder is distributed across Participants — either `CUSTOM` (a flat split: EVENLY / BY_SHARES / BY_PERCENTAGE / BY_AMOUNT over chosen Participants) or `PROPORTIONAL` (in proportion to each Participant's Item_Subtotal, reusing the `distributeWeightedAmounts` remainder policy in Minor_Units). Persisted alongside the Item_Remainder.
- **Entry_Total**: The composed total of an Authoritative_Itemization in the Entry_Currency, equal to `Σ Item_Amount + Item_Remainder`. When the Entry_Currency differs from the Group_Currency, the Entry_Total is what the server converts (it is written to `originalAmount`).
- **Items_Authoritative_Marker**: An explicit persisted boolean (name to be finalised in design, e.g. `itemsAuthoritative`) recording whether the Expense's Items drive the split. `true` ⇒ Authoritative_Itemization (`splitMode = BY_AMOUNT` and the derived `paidFor` came from the Item_Splitter); `false` ⇒ any Items present are Documentation_Items and the split is the persisted Legacy_Split_Mode. This marker — not the mere existence of Items — is the single source of truth for whether an Expense is itemized (see Requirements 1.6–1.7 as amended).

## Requirements

### Requirement 1: Enabling Itemized Mode

**User Story:** As a user creating an expense, I want to optionally turn on itemized mode, so that I can split the expense by individual line items instead of by a single split mode.

#### Acceptance Criteria

1. THE Expense_Form SHALL provide an explicit control to enable or disable Itemized_Mode for the Expense.
2. WHEN Itemized_Mode is disabled, THE Expense_Form SHALL behave exactly as today, splitting the Expense by the selected Legacy_Split_Mode.
3. WHEN the user enables Itemized_Mode, THE Expense_Form SHALL reveal the ability to add, edit, and remove Items and to enter an optional Tax_Amount and Tip_Amount.
4. THE Expense_Form SHALL persist whether an Expense is itemized so that reopening the Expense for edit restores Itemized_Mode with its Items, Item_Assignments, Tax_Amount, and Tip_Amount.
5. WHEN Itemized_Mode is enabled but no Items have been added, THE Expense_Form SHALL treat the Expense as not yet valid for itemized saving and SHALL require at least one Item before persisting in Itemized_Mode.
6. **(Amended by the v1.1 alignment — Requirements 12, 13.)** Whether an Expense is itemized SHALL be recorded by the explicit Items_Authoritative_Marker, NOT by the mere existence of Items. Specifically: (a) Items MAY exist while a Legacy_Split_Mode is active, in which case they are Documentation_Items and the marker is `false`; (b) when the marker is `true`, `splitMode` SHALL be `BY_AMOUNT` and the `paidFor` SHALL be the split derived by the Item_Splitter; (c) turning the marker off (leaving authoritative itemization) SHALL keep the Items as Documentation_Items per Requirement 13.4 — it SHALL NOT delete them; and (d) deleting the Items is a separate, explicit action distinct from turning off the marker. The original R1.6 rule ("disabling discards items") applies only to the legacy single-toggle framing and is superseded by this marker model.
7. THE persisted state SHALL be self-consistent with the Items_Authoritative_Marker: WHEN the marker is `true` THE Expense SHALL have `splitMode = BY_AMOUNT` with a `paidFor` consistent with the Item_Splitter output, and WHEN the marker is `false` THE Expense SHALL be split by its persisted Legacy_Split_Mode regardless of whether Documentation_Items are present. The computation SHALL always agree with the marker, never inferring "itemized" from the presence of Items alone.
8. WHEN the Expense is a reimbursement (payment) or has a recurrence rule other than NONE, THE Expense_Form SHALL NOT offer Itemized_Mode, and such Expenses SHALL always use their current non-itemized behaviour.

### Requirement 2: Item Fields

**User Story:** As a user, I want to add line items with a title and an amount, so that each charge on the receipt is captured individually.

#### Acceptance Criteria

1. WHEN Itemized_Mode is enabled, THE Expense_Form SHALL allow the user to add one or more Items, each with an Item_Title and an Item_Amount.
2. THE Expense_Form SHALL accept Item_Amount input in the same way as the main amount field, including arithmetic expressions evaluated via `src/lib/math-expression.ts`, and SHALL store each Item_Amount in Minor_Units.
3. THE Expense_Form SHALL require each Item to have a non-empty Item_Title.
4. THE Expense_Form SHALL require each Item_Amount to be a valid monetary value greater than or equal to zero in Minor_Units.
5. WHEN the user removes an Item, THE Expense_Form SHALL also remove that Item's Item_Assignments.
6. THE `ExpenseItem` model SHALL persist Item_Title and Item_Amount and SHALL relate each Item to its parent Expense such that deleting the Expense deletes its Items.

### Requirement 3: Assigning an Item to One or More Participants

**User Story:** As a user, I want to assign each line item to one or more participants, so that people only pay for what they actually consumed and shared items are divided fairly.

#### Acceptance Criteria

1. WHEN Itemized_Mode is enabled, THE Expense_Form SHALL allow each Item to be assigned to one or more Participants drawn from the Expense's `paidFor` set.
2. WHEN an Item is assigned to a single Participant, THE Item_Splitter SHALL allocate the full Item_Amount to that Participant's Item_Subtotal.
3. WHEN an Item is assigned to multiple Participants, THE Item_Splitter SHALL divide the Item_Amount equally among those Participants in Minor_Units, assigning any indivisible remainder cents to the earliest Participants in the Expense's current `paidFor` order, using the same deterministic remainder rule as `distributeEqualAmounts` in `src/lib/distribute-amount.ts`, so that the assigned portions sum exactly to the Item_Amount.
4. THE Item_Splitter SHALL compute each Participant's Item_Subtotal as the sum of that Participant's allocated portions across all Items assigned to them.
5. THE `ExpenseItem` model SHALL persist each Item_Assignment as a link between an Item and a Participant.

### Requirement 4: Proportional Tax and Tip

**User Story:** As a user, I want tax and tip distributed in proportion to what each person ordered, so that a person with a larger subtotal pays a larger share of tax and tip.

> **Amended by Requirement 16 (v1.1).** Tax and tip are no longer two independently authoritative fields; they are UI shortcuts that contribute to the single Item_Remainder pool. The proportional behaviour below is exactly the `PROPORTIONAL` Remainder_Allocation_Mode applied to the tax+tip portion of the Item_Remainder. Read "Tax_Amount and Tip_Amount" in this requirement as "the proportionally-allocated part of the Item_Remainder". The exactness guarantees (4.5) and the zero-subtotal fallback (4.4) carry over unchanged to the Item_Remainder.

#### Acceptance Criteria

1. THE Expense_Form SHALL allow an optional Tax_Amount and an optional Tip_Amount, each entered in the same manner as the main amount field and stored (as contributions to the Item_Remainder — Requirement 16.7) in Minor_Units.
2. WHEN Tax_Amount is greater than zero, THE Item_Splitter SHALL distribute Tax_Amount across Participants in proportion to each Participant's Item_Subtotal, in Minor_Units.
3. WHEN Tip_Amount is greater than zero, THE Item_Splitter SHALL distribute Tip_Amount across Participants in proportion to each Participant's Item_Subtotal, in Minor_Units.
4. WHEN the sum of all Item_Subtotals is zero but Tax_Amount or Tip_Amount is greater than zero, THE Item_Splitter SHALL distribute Tax_Amount and Tip_Amount equally across the assigned Participants rather than dividing by zero.
5. WHEN distributing Tax_Amount or Tip_Amount produces an indivisible remainder in Minor_Units, THE Item_Splitter SHALL assign the remainder deterministically so that the distributed amounts sum exactly to Tax_Amount and Tip_Amount respectively.
6. THE Item_Splitter SHALL compute each Participant_Share as that Participant's Item_Subtotal plus their distributed Tax_Amount slice plus their distributed Tip_Amount slice.

### Requirement 5: Cent-Exact Invariant

**User Story:** As a user, I want the per-person amounts to always add up to the exact expense total, so that no cent is lost or created when an expense is itemized.

#### Acceptance Criteria

1. THE Item_Splitter SHALL guarantee that the sum of all Participant_Shares in Minor_Units equals the Expense_Total in Minor_Units exactly (the Cent_Exact_Invariant).
2. THE Expense_Total in Minor_Units SHALL equal the sum of all Item_Amounts plus the Item_Remainder when itemization is authoritative (equivalently, sum of Item_Amounts plus Tax_Amount plus Tip_Amount in the tax/tip special case).
3. THE Item_Splitter SHALL be a pure function in `src/lib/` and SHALL be covered by property-based tests that assert the Cent_Exact_Invariant across randomized Items, Item_Assignments, and Item_Remainder (both PROPORTIONAL and CUSTOM Remainder_Allocation_Mode).
4. WHEN itemization is authoritative, THE system SHALL persist the resulting per-Participant amounts as an equivalent `BY_AMOUNT` split so that balances, settlements, activity, and export consume the itemized result without a new balance-calculation path.
5. THE persisted `Expense.amount` SHALL equal the Expense_Total in Minor_Units when itemization is authoritative.

### Requirement 6: Behaviour When Itemized Mode Is Off

**User Story:** As a user, I want expenses without line items to keep working exactly as before, so that adding itemization does not change or break any existing splitting behaviour.

#### Acceptance Criteria

1. WHEN an Expense has no Items, THE system SHALL split it using the selected Legacy_Split_Mode (EVENLY, BY_SHARES, BY_PERCENTAGE, or BY_AMOUNT) exactly as it does today.
2. WHEN Itemized_Mode is off, THE system SHALL preserve existing multi-payer behaviour via the `ExpensePaidBy` Payers, unchanged.
3. WHEN Itemized_Mode is off and the Expense includes non-members in `paidFor`, THE system SHALL preserve the existing Non_Member_Decomposition behaviour, unchanged.
4. THE presence of the new `ExpenseItem` model and its links SHALL NOT alter the persistence or computation of Expenses that have no Items.

### Requirement 7: Payers and Non-Member Decomposition With Itemized Mode On

**User Story:** As a user itemizing an expense, I want "who paid" and the treatment of non-members to keep working the same, so that itemization only changes how much each person owes, not who funded it or how non-members are handled.

#### Acceptance Criteria

1. WHEN Itemized_Mode is on, THE Payers of the Expense SHALL remain independent of the computed Participant_Shares; the user SHALL be able to set single or multiple Payers via `ExpensePaidBy` exactly as in the legacy modes.
2. THE computed Participant_Shares SHALL represent what each Participant owes, and THE system SHALL NOT require that a Participant be a Payer or that a Payer be a Participant.
3. WHEN Itemized_Mode is on and the Expense includes non-members in `paidFor`, THE system SHALL run the existing Non_Member_Decomposition on the computed Participant_Shares, producing the same group-half and per-non-member direct-half structure as it does for a `BY_AMOUNT` Expense today.
4. WHEN a non-member Participant is assigned to one or more Items, THE system SHALL include that non-member's computed Participant_Share in the Non_Member_Decomposition, so a non-member with an Item is decomposed exactly as a non-member with a `BY_AMOUNT` share is today.
5. THE equivalent `BY_AMOUNT` split produced from itemization (per Requirement 5) SHALL be the input to Payers handling and Non_Member_Decomposition, so no separate code path is introduced.

### Requirement 8: Validation When Assignments or Amounts Do Not Add Up

**User Story:** As a user, I want clear validation when my line items or assignments are inconsistent, so that I cannot save an itemized expense whose numbers do not reconcile.

> **Amended by the v1.1 alignment.** Read "Itemized_Mode is on" as "Authoritative_Itemization". Criterion 8.2 (derive a read-only total from items) is **superseded by Requirement 17**: the Expense_Total stays editable and the gap becomes the Item_Remainder; the overshoot guard and "set amount from items" of Requirement 17.2–17.3 replace the "reject a conflicting manual total" rule. References to "Tax_Amount / Tip_Amount" below mean the Item_Remainder (Requirement 16).

#### Acceptance Criteria

1. WHEN itemization is authoritative, THE Expense_Form SHALL require every Item to be assigned to at least one Participant before the Expense can be saved.
2. _(Superseded by Requirement 17.)_ The earlier rule computed the Expense_Total as sum of Item_Amounts plus tax plus tip and presented it read-only. Under v1.1 the total is editable and reconciled via the Item_Remainder (Requirement 17.1) with an overshoot guard (Requirement 17.2).
3. IF an Item_Amount or any Item_Remainder input (including the Tax_Amount / Tip_Amount shortcuts) is not a valid monetary value, THEN THE Expense_Form SHALL block saving and SHALL indicate which field is invalid.
4. IF itemization is authoritative and no Items exist, THEN THE Expense_Form SHALL block saving and SHALL indicate that at least one Item is required.
5. IF a Participant assigned to an Item is later removed from the Expense's `paidFor` set, THEN THE Expense_Form SHALL block saving until that Item's Item_Assignments reference only current Participants.
6. WHEN validation fails, THE Expense_Form SHALL retain all entered Items, Item_Assignments, and Item_Remainder (including any tax/tip shortcut values) without loss.

### Requirement 9: Optional Receipt Prefill of Items

**User Story:** As a user scanning a receipt, I want the scan to optionally prefill line items, so that I do not have to type them by hand — but I can still itemize manually without any scan.

#### Acceptance Criteria

1. THE itemized feature SHALL NOT require a receipt scan; the user SHALL be able to add Items entirely manually.
2. WHEN the Receipt_Extractor is available and a receipt is scanned, THE system MAY prefill the Expense_Form with suggested Items (each with a suggested Item_Title and Item_Amount) in addition to the existing amount, category, date, and title suggestions.
3. WHEN the Receipt_Extractor prefills Items, THE Expense_Form SHALL present the suggested Items as editable so the user can correct titles, amounts, and assignments before saving.
4. WHEN the Receipt_Extractor is not configured or returns no Items, THE Expense_Form SHALL continue to function for manual itemization without error.
5. THE Receipt_Extractor SHALL NOT assign suggested Items to Participants automatically; Item_Assignment SHALL remain a user decision.
6. **(v1.1 gate.)** WHEN the Receipt_Extractor prefills Items, THE Expense_Form SHALL add them as Documentation_Items with the Items_Authoritative_Marker `false`, keeping the current Legacy_Split_Mode active; making the scanned Items drive the split SHALL still require the Switch_To_Itemized_Confirmation (Requirement 12.2), so a scan never silently changes who owes what.

### Requirement 10: Export Reflects Itemization

**User Story:** As a user exporting my group data, I want itemized expenses to be represented in the export, so that the exported record reflects how the expense was split.

#### Acceptance Criteria

1. WHEN an Expense is itemized, THE CSV export SHALL represent the resulting per-Participant amounts consistently with how non-itemized `BY_AMOUNT` expenses are exported today.
2. WHEN an Expense has Items (whether authoritative or Documentation_Items), THE JSON export SHALL include the itemization detail — the Items with their Item_Assignments, the Item_Remainder with its Remainder_Allocation_Mode, and the Items_Authoritative_Marker — so the split and its documentation can be reconstructed on reload/import. (In the tax/tip special case the Item_Remainder is the tax+tip pool; the export emits the stored remainder, which is the source of truth per the glossary.)
3. WHEN an Expense has no Items, THE export SHALL be unchanged from today's output.

### Requirement 11: Currency of Items and Conversion

**User Story:** As a user entering an itemized expense in a currency other than my group's, I want the line items, tax, and tip to be converted the same way a normal expense is, so that the balances stay in the group currency and still add up exactly.

> **Amended by Requirements 16 and 18 (v1.1).** Read "Tax_Amount and Tip_Amount" below as "the Item_Remainder". Requirement 18 tightens 11.5: with FX and authoritative itemization the composed Entry_Total (`Σ Item_Amount + Item_Remainder`) is written to `originalAmount` (the value converted), and `amount` is derived from it — not merely reflecting it.

#### Acceptance Criteria

1. THE Item_Amount and the Item_Remainder SHALL all be entered and summed in the Entry_Currency; the Entry_Total SHALL equal the sum of all Item_Amounts plus the Item_Remainder.
2. WHEN the Entry_Currency equals the Group_Currency, THE Item_Splitter SHALL compute Participant_Shares directly in the Group_Currency and the Cent_Exact_Invariant SHALL hold in the Group_Currency.
3. WHEN the Entry_Currency differs from the Group_Currency, THE system SHALL apply the existing server-authoritative Currency_Conversion to the composed Expense_Total, and THE persisted per-Participant amounts SHALL be in the Group_Currency.
4. WHEN Currency_Conversion is applied, THE sum of the converted per-Participant amounts in the Group_Currency Minor_Units SHALL equal the converted Expense_Total in the Group_Currency Minor_Units exactly, preserving the Cent_Exact_Invariant after conversion (no cent lost or gained through rounding).
5. THE existing persisted conversion fields (`originalAmount`, `originalCurrency`, `conversionRate`) SHALL continue to describe the Expense_Total as they do for non-itemized Expenses today.
6. THE Minor_Units decimal digits used for Items, Tax_Amount, and Tip_Amount SHALL follow the Entry_Currency's decimal digits before conversion and the Group_Currency's decimal digits after conversion, consistent with `getDecimalDigits` in `src/lib/currency-conversion.ts`.

<!-- ─────────────────────────────────────────────────────────────────────── -->
<!-- v1.1 UX ALIGNMENT WITH SPLIIT-CLOUD                                       -->
<!--                                                                          -->
<!-- The requirements below amend and, where noted, supersede Requirements    -->
<!-- 1–11 to align the product behaviour with the sibling fork's itemized UX  -->
<!-- (documentation-vs-authoritative gate, confirmation dialogs, unit price × -->
<!-- quantity, an "Other" remainder pool, and a currency bugfix), WITHOUT      -->
<!-- changing the Knots architecture. Hard constraints that remain in force:  -->
<!--                                                                          -->
<!--  * The authoritative balance path stays computed `BY_AMOUNT`             -->
<!--    `paidFor.shares`. There is NO `SplitMode.ITEMIZED` enum value and NO  -->
<!--    re-derivation of balances from Items at read time.                    -->
<!--  * Non-member decomposition, multi-payer, and export keep consuming      -->
<!--    `BY_AMOUNT` exactly as today.                                         -->
<!--  * Items / tax-or-remainder stay stored in Entry_Currency Minor_Units;   -->
<!--    the Group_Currency authority stays in `paidFor.shares`.               -->
<!--  * Reimbursements and recurrence ≠ NONE still cannot use                 -->
<!--    Authoritative_Itemization.                                            -->
<!--  * Cent-exactness in integer Minor_Units and property tests remain       -->
<!--    required (Requirement 5 continues to apply to the derived split).     -->
<!-- ─────────────────────────────────────────────────────────────────────── -->

### Requirement 12: Documentation Items vs Authoritative Itemization

**User Story:** As a user, I want to jot down the line items on a receipt without immediately changing how the expense is split, and only make the items drive who owes what when I choose to, so that recording detail and deciding the split are separate steps.

This requirement amends Requirement 1: enabling the item editor and adding Items no longer, by itself, make the Expense itemized. Items first exist as Documentation_Items; itemization becomes authoritative only via the gate below.

#### Acceptance Criteria

1. THE Expense_Form SHALL allow the user to add, edit, and remove Items while the Expense's active split remains a Legacy_Split_Mode; in this state the Items are Documentation_Items and SHALL NOT affect the computed `paidFor` or balances.
2. WHEN the Expense is split by a Legacy_Split_Mode and the user performs an action that would make Items drive the split — editing an Item's Participants, editing the All_Items_Split, or activating an explicit "Use items as split" control — THE Expense_Form SHALL show the Switch_To_Itemized_Confirmation before applying that change.
3. WHEN the user confirms the Switch_To_Itemized_Confirmation, THE Expense_Form SHALL set Authoritative_Itemization, derive the `BY_AMOUNT` `paidFor` from the Item_Splitter, and hide or disable the Legacy_Split_Mode selector for as long as itemization is authoritative.
4. WHEN the user cancels the Switch_To_Itemized_Confirmation, THE Expense_Form SHALL leave the active Legacy_Split_Mode and the Items unchanged (Items remain Documentation_Items).
5. WHILE itemization is authoritative, THE persisted `splitMode` SHALL remain `BY_AMOUNT` and THE system SHALL NOT introduce any `SplitMode.ITEMIZED` value or re-derive balances from Items at read time.
6. THE Expense_Form SHALL make clear in the UI whether the current Items are Documentation_Items or Authoritative_Itemization (for example, whether editing participants is active), so the user understands whether the Items currently drive the split.

### Requirement 13: Leaving Authoritative Itemization

**User Story:** As a user, I want to switch an itemized expense back to a normal split mode with a clear confirmation, so that I do not lose my split by accident.

#### Acceptance Criteria

1. WHEN itemization is authoritative and the user chooses to return to a Legacy_Split_Mode, THE Expense_Form SHALL show the Leave_Itemized_Confirmation naming the target split mode.
2. WHEN the user confirms the Leave_Itemized_Confirmation, THE Expense_Form SHALL restore the chosen Legacy_Split_Mode and populate a valid `paidFor` (a default even split across the current Participants unless the user has other input), and SHALL re-show the Legacy_Split_Mode selector.
3. WHEN the user cancels the Leave_Itemized_Confirmation, THE Expense_Form SHALL remain in Authoritative_Itemization with Items, Item_Remainder, and derived `paidFor` unchanged.
4. WHEN the user leaves Authoritative_Itemization, THE Expense_Form SHALL retain the Items as Documentation_Items (not delete them), so the user can re-enter itemization without re-typing; the saved Expense reflects the Legacy_Split_Mode split, and the Items are persisted as documentation. This supersedes Requirement 1.6's "disabling discards items" rule for the leave-itemized flow: Items are kept as documentation rather than discarded.
5. WHEN an Expense is saved with Documentation_Items and a Legacy_Split_Mode, THE `paidFor` and balances SHALL be computed from the Legacy_Split_Mode, and the persisted Items SHALL be marked as non-authoritative so that reopening the Expense restores the Legacy_Split_Mode with the Items shown as documentation.

### Requirement 14: Per-Line Unit Price and Quantity

**User Story:** As a user entering a receipt, I want each line to have a unit price and a quantity, so that "3 × coffee at 2.50" is captured as one line whose amount is 7.50.

#### Acceptance Criteria

1. THE Expense_Form SHALL allow each Item to have an Item_Unit_Price and an Item_Quantity, and SHALL compute `Item_Amount = Item_Unit_Price × Item_Quantity` in Minor_Units.
2. THE Expense_Form SHALL require Item_Quantity to be a positive integer and SHALL default it to 1.
3. THE Expense_Form SHALL accept Item_Unit_Price input in the same way as the main amount field (arithmetic expressions via `src/lib/math-expression.ts`), and SHALL store the resulting Item_Unit_Price in Minor_Units.
4. THE `ExpenseItem` model SHALL persist Item_Unit_Price and Item_Quantity, and the derived Item_Amount SHALL be recomputable from them so that reopening the Expense shows the same per-line breakdown.
5. THE Cent_Exact_Invariant SHALL continue to hold with unit-price×quantity Items: `Σ Item_Amount + Item_Remainder` equals the Expense_Total in Minor_Units exactly.

### Requirement 15: All-Items Default Split

**User Story:** As a user, I want to set one split for all items at once (for example "everyone shares everything"), so that I do not have to assign each line individually.

#### Acceptance Criteria

1. THE Expense_Form SHALL provide an All_Items_Split control that specifies a default set of Participants (and, where applicable, a per-line split rule) for every Item.
2. WHEN the user edits the All_Items_Split while the Expense is split by a Legacy_Split_Mode, THE Expense_Form SHALL treat this as an action that triggers the Switch_To_Itemized_Confirmation (Requirement 12.2).
3. WHEN the user applies the All_Items_Split, THE Expense_Form SHALL apply it to every current Item, replacing each Item's Participant assignment with the default.
4. WHEN Items have differing assignments, THE Expense_Form SHALL indicate that the All_Items_Split is "mixed" rather than showing a single default.
5. Applying the All_Items_Split SHALL preserve the Cent_Exact_Invariant on the resulting derived split.

### Requirement 16: The "Other" Remainder Pool

**User Story:** As a user, I want the difference between the expense total and the sum of my line items to be handled as a single "Other" amount (tax, tip, service) that I can split proportionally or with a chosen split, instead of only two fixed tax and tip fields.

This requirement generalises Requirement 4 (Proportional Tax and Tip). Tax_Amount and Tip_Amount as two fixed fields are subsumed by the single Item_Remainder pool; a proportional Item_Remainder reproduces the previous "tax and tip proportional to subtotal" behaviour.

#### Acceptance Criteria

1. THE Expense_Form SHALL compute the Item_Remainder as `Expense_Total − Σ Item_Amount` in Minor_Units and SHALL display it as an "Other" line when it is non-zero.
2. THE Expense_Form SHALL allow the Item_Remainder to be allocated either PROPORTIONAL to each Participant's Item_Subtotal or CUSTOM via a flat split (EVENLY / BY_SHARES / BY_PERCENTAGE / BY_AMOUNT) over chosen Participants (the Remainder_Allocation_Mode).
3. WHEN Remainder_Allocation_Mode is PROPORTIONAL, THE Item_Splitter SHALL distribute the Item_Remainder in proportion to Item_Subtotals using the `distributeWeightedAmounts` remainder policy in Minor_Units; WHEN the sum of Item_Subtotals is zero, THE Item_Splitter SHALL fall back to an equal split across the assigned Participants (as in Requirement 4.4) rather than dividing by zero.
4. WHEN Remainder_Allocation_Mode is CUSTOM, THE Item_Splitter SHALL distribute the Item_Remainder using the chosen flat split and the same integer Minor_Unit distributors used elsewhere (`distributeEqualAmounts` / `distributeWeightedAmounts`).
5. THE sum of the distributed Item_Remainder slices in Minor_Units SHALL equal the Item_Remainder exactly, and the sum of all Participant_Shares SHALL equal the Expense_Total exactly (the Cent_Exact_Invariant).
6. WHEN the Item_Remainder is negative (Items overshoot the Expense_Total in the Expense's sign direction), THE Expense_Form SHALL treat this as invalid per Requirement 17 rather than distributing a negative "Other".
7. WHERE the implementation retains the previous fixed Tax_Amount and Tip_Amount inputs, they SHALL be modelled as contributions to the Item_Remainder pool so the exactness and storage rules of this requirement apply uniformly.

### Requirement 17: Editable Expense Total With Items Not Exceeding It

**User Story:** As a user, I want the expense total to stay editable even with line items, and to be warned (with a quick fix) if my items add up to more than the total, so that the "Other" remainder is always a sensible amount.

This requirement amends Requirement 8.2 (which required the total to be derived read-only from items). In the v1.1 model the Expense_Total stays editable and the Item_Remainder absorbs the gap.

#### Acceptance Criteria

1. THE Expense_Form SHALL keep the Expense_Total (amount) field editable while Items are present, so the gap between the total and the Item subtotals becomes the Item_Remainder.
2. IF the sum of Item_Amounts exceeds the Expense_Total in the Expense's sign direction (`itemsExceedExpenseAmount`), THEN THE Expense_Form SHALL block saving, indicate the error, and offer a "set amount from items" action that sets the Expense_Total to the sum of Item_Amounts.
3. WHEN the user activates "set amount from items", THE Expense_Form SHALL set the Expense_Total to `Σ Item_Amount` in Minor_Units, making the Item_Remainder zero.
4. WHILE itemization is authoritative and the Entry_Currency differs from the Group_Currency, THE editable total the user sees and edits SHALL be the Entry_Total in the Entry_Currency, and THAT value SHALL be the `originalAmount` the server converts. THE Group_Currency `amount` SHALL be derived from the Entry_Total by Currency_Conversion and SHALL NOT be independently editable in this state. There SHALL be exactly one editable Entry_Currency total, and both the Item_Remainder computation and `originalAmount` SHALL use it. (This resolves the earlier ambiguity that allowed either a read-only or an editable total; with FX the Entry_Total is the single editable source and `amount` is derived.)
5. THE persisted `Expense.amount` SHALL equal the Expense_Total in Group_Currency Minor_Units, consistent with Requirement 5.5 and the conversion rules of Requirement 18.
6. WHEN the Entry_Currency equals the Group_Currency, THE editable Expense_Total is directly the Group_Currency total (there is no separate Entry_Total and no `originalAmount`), consistent with Requirement 18.5.

### Requirement 18: Currency Bugfix — Convert the Itemized Total via originalAmount

**User Story:** As a user entering an itemized expense in a currency other than my group's, I want the whole itemized total to be converted correctly, so that balances are right and no rounding fights the FX conversion.

This requirement fixes a defect in the current implementation and tightens Requirement 11: when itemization is authoritative and a conversion is required, the composed Entry_Currency total must be the value the server converts, written to `originalAmount` — not merely reflected in `amount`.

#### Acceptance Criteria

1. WHEN the Entry_Currency differs from the Group_Currency and itemization is authoritative, THE Expense_Form SHALL write the composed Entry_Total (`Σ Item_Amount + Item_Remainder`, in Entry_Currency Minor_Units) to `originalAmount`, so the server's `resolveConversion` converts the itemized total.
2. THE existing FX effect that derives `amount` from `originalAmount × rate` SHALL NOT overwrite or clobber the itemized Entry_Total; the Entry_Total written to `originalAmount` SHALL remain the sum of Items plus Item_Remainder.
3. WHILE itemization is authoritative and a conversion is required, THE single editable Entry_Currency total (the Entry_Total) SHALL be the value written to `originalAmount` (per Requirement 17.4), and the Group_Currency `amount` SHALL be derived from it by conversion; the form SHALL NOT present a separately editable Group_Currency amount that could disagree with the itemized Entry_Total.
4. WHEN `resolveConversion` returns the converted Group_Currency total, THE per-Participant shares SHALL be re-derived from that converted total so their sum equals it exactly (unchanged from Requirement 11.4), and `originalAmount` / `originalCurrency` / `conversionRate` SHALL describe the Entry_Total and its conversion (tightening Requirement 11.5).
5. WHEN the Entry_Currency equals the Group_Currency, THE behaviour SHALL be unchanged from Requirement 11.2 (shares computed directly in the Group_Currency; no `originalAmount` written).

### Requirement 19: Scope and Phasing of the v1.1 Upgrades

**User Story:** As a maintainer, I want the v1.1 requirements to state clearly which upgrades ship in this pass and which are explicitly deferred, so the design and task breakdown have unambiguous scope.

#### Acceptance Criteria

1. THE following v1.1 behaviours SHALL be treated as in-scope for this pass: the Documentation vs Authoritative gate with confirmation dialogs (Requirements 12, 13), the "Other" Item_Remainder pool with PROPORTIONAL and CUSTOM allocation replacing the two fixed fields (Requirement 16), the editable-total-with-overshoot guard (Requirement 17), and the currency bugfix (Requirement 18). These preserve the cent-exact `BY_AMOUNT` architecture.
2. Per-line Item_Unit_Price × Item_Quantity (Requirement 14) and the All_Items_Split control (Requirement 15) MAY be deferred to a later task phase if they enlarge this pass too much; WHEN deferred, they SHALL remain named requirements so the design records them and a subsequent phase implements them. Deferral SHALL NOT remove them from the requirements.
3. Per-line split rules (each Item having its own EVENLY / BY_SHARES / BY_PERCENTAGE / BY_AMOUNT split, as in Cloud) are OUT OF SCOPE for the Knots v1.1: an Item is split equally among its assigned Participants (Requirement 3.3). This keeps the single-policy `Item_Splitter` and the integer Minor_Unit distributors in `src/lib/distribute-amount.ts`; Knots SHALL NOT adopt Cloud's exact-rational / BigInt share math.
4. THE authoritative balance path SHALL remain computed `BY_AMOUNT` `paidFor.shares` for every in-scope and deferred item above; no upgrade in this document SHALL introduce a `SplitMode.ITEMIZED` value or read-time re-derivation of balances from Items.
