import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'
import {
  getGroupExpenseEditPath,
  getGroupExpenseNewPath,
} from '@/lib/expense-editor-navigation'
import { stashExpensePrefill } from '@/lib/expense-prefill-store'

/** Navigate to the group expense Edit_Page for the given expense. */
export function openEditGroupExpense(
  router: AppRouterInstance,
  groupId: string,
  expenseId: string,
) {
  router.push(getGroupExpenseEditPath(groupId, expenseId))
}

export function openEditDirectExpense(expenseId: string) {
  window.dispatchEvent(
    new CustomEvent('edit-direct-expense', {
      detail: { expenseId },
    }),
  )
}

/**
 * Stash a create prefill for the group and navigate to the New_Page, which
 * consumes the prefill on mount. There is no group picker on the page, so the
 * group name is no longer needed.
 */
export function openCopyGroupExpense(
  router: AppRouterInstance,
  groupId: string,
  prefill: ExpenseFormCreatePrefill,
) {
  stashExpensePrefill(groupId, prefill)
  router.push(getGroupExpenseNewPath(groupId))
}

export function openCopyDirectExpense(
  friendId: string,
  prefill: ExpenseFormCreatePrefill,
) {
  window.dispatchEvent(
    new CustomEvent('create-direct-expense', {
      detail: { friendId, prefill },
    }),
  )
}
