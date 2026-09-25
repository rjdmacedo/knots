import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'

/**
 * Transient, in-memory handoff for expense create prefills.
 *
 * `ExpenseFormCreatePrefill` holds a live `Date` and nested arrays
 * (`documents`, `items`, `paidFor`), so it cannot be cleanly encoded as URL
 * query params. Instead, an entry point stashes the prefill keyed by group id
 * right before navigating to the New_Page, and the New_Page consumes it once on
 * mount. Consuming clears the entry so a later mount or refresh does not
 * re-apply stale prefill.
 */
const store = new Map<string, ExpenseFormCreatePrefill>()

/** Store a create prefill for the given group id, replacing any prior stash. */
export function stashExpensePrefill(
  groupId: string,
  prefill: ExpenseFormCreatePrefill,
): void {
  store.set(groupId, prefill)
}

/**
 * Return and clear the stashed prefill for the given group id. Returns
 * `undefined` when nothing is stashed (e.g. hard refresh or deep link), which
 * the New_Page treats as an empty create form.
 */
export function consumeExpensePrefill(
  groupId: string,
): ExpenseFormCreatePrefill | undefined {
  const prefill = store.get(groupId)
  store.delete(groupId)
  return prefill
}

/**
 * Handoff for the standalone create page (`/expenses/new`).
 * A friend page or a copy action can preselect a friend and a form prefill.
 */
export type StandaloneExpenseCreateHandoff = {
  prefill?: ExpenseFormCreatePrefill
  friendId?: string
  friendUsername?: string
}

let standaloneHandoff: StandaloneExpenseCreateHandoff | null = null

export function stashStandaloneExpenseCreate(
  handoff: StandaloneExpenseCreateHandoff,
): void {
  standaloneHandoff = handoff
}

export function consumeStandaloneExpenseCreate():
  | StandaloneExpenseCreateHandoff
  | undefined {
  const handoff = standaloneHandoff ?? undefined
  standaloneHandoff = null
  return handoff
}
