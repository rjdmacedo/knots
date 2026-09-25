import { parseExpenseCreateContext } from '@/lib/expense-create-context'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'

/** Path to the group expense create page. */
export function getGroupExpenseNewPath(groupId: string) {
  return `/groups/${groupId}/expenses/new`
}

/** Path to create an expense when no group is in context. */
export function getStandaloneExpenseNewPath() {
  return '/expenses/new'
}

/** Path to the group expense edit page. */
export function getGroupExpenseEditPath(groupId: string, expenseId: string) {
  return `/groups/${groupId}/expenses/${expenseId}/edit`
}

/**
 * Pure parser for the `edit` route segment.
 *
 * `parseExpenseCreateContext` only recovers the group id, so the expense id
 * must be recovered here. Returns `null` when the pathname is not a
 * well-formed edit path.
 */
export function parseGroupExpenseEditPath(
  pathname: string,
): { groupId: string; expenseId: string } | null {
  const match = pathname.match(/^\/groups\/([^/]+)\/expenses\/([^/]+)\/edit$/)
  if (match?.[1] && match[2]) {
    return { groupId: match[1], expenseId: match[2] }
  }
  return null
}

/** Whether the editor is creating a new expense or editing an existing one. */
export type EditorMode =
  | { kind: 'new'; groupId: string }
  | { kind: 'edit'; groupId: string; expenseId: string }

/**
 * The path to return to when the editor finishes or is cancelled.
 *
 * New → the group expense list; edit → the expense Detail_Page.
 */
export function getEditorReturnPath(mode: EditorMode) {
  if (mode.kind === 'edit') {
    return getGroupExpenseDetailPath(mode.groupId, mode.expenseId)
  }
  return `/groups/${mode.groupId}/expenses`
}

/** Where an "add expense" action should go from the current route. */
export type AddExpenseTarget = { kind: 'navigate'; path: string }

/**
 * Create always opens a page. A group route keeps that group locked on its
 * New_Page. Anywhere else goes to the standalone New_Page, where the user
 * picks at most one group and any friends.
 */
export function resolveAddExpenseTarget(pathname: string): AddExpenseTarget {
  const context = parseExpenseCreateContext(pathname)
  if (context?.type === 'group') {
    return { kind: 'navigate', path: getGroupExpenseNewPath(context.groupId) }
  }
  return { kind: 'navigate', path: getStandaloneExpenseNewPath() }
}
