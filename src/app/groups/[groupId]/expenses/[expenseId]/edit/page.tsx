import { EditExpenseFormV2 } from '@/app/groups/[groupId]/expenses/edit-expense-form-v2'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Edit Expense',
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>
}) {
  const { groupId, expenseId } = await params
  return (
    <EditExpenseFormV2
      groupId={groupId}
      expenseId={expenseId}
      runtimeFeatureFlags={await getRuntimeFeatureFlags()}
    />
  )
}
