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
