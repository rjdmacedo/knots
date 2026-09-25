'use client'

import { ExpenseEditor } from '@/app/groups/[groupId]/expenses/expense-editor'

type GroupExpenseEditPageClientProps = {
  groupId: string
  expenseId: string
}

export function GroupExpenseEditPageClient({
  groupId,
  expenseId,
}: GroupExpenseEditPageClientProps) {
  return <ExpenseEditor groupId={groupId} expenseId={expenseId} />
}
