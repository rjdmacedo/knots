import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'

export function openEditGroupExpense(groupId: string, expenseId: string) {
  window.dispatchEvent(
    new CustomEvent('edit-group-expense', {
      detail: { groupId, expenseId },
    }),
  )
}

export function openEditDirectExpense(expenseId: string) {
  window.dispatchEvent(
    new CustomEvent('edit-direct-expense', {
      detail: { expenseId },
    }),
  )
}

export function openCopyGroupExpense(
  groupId: string,
  groupName: string,
  prefill: ExpenseFormCreatePrefill,
) {
  window.dispatchEvent(
    new CustomEvent('create-group-expense', {
      detail: { groupId, groupName, prefill },
    }),
  )
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
