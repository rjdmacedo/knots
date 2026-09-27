'use client'

import { ExpenseEditor } from '@/app/groups/[groupId]/expenses/expense-editor'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'

type GroupExpenseEditPageClientProps = {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}

export function GroupExpenseEditPageClient({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: GroupExpenseEditPageClientProps) {
  return (
    <ExpenseEditor
      groupId={groupId}
      expenseId={expenseId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
