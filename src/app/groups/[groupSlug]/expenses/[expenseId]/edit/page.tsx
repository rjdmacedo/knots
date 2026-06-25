import { cached } from '@/app/cached-functions'
import { EditExpenseForm } from '@/app/groups/[groupSlug]/expenses/edit-expense-form'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Edit Expense',
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupSlug: string; expenseId: string }>
}) {
  const { groupSlug, expenseId } = await params
  const group = await cached.getGroupBySlug(groupSlug)

  if (!group) {
    notFound()
  }

  return (
    <EditExpenseForm
      groupId={group.id}
      expenseId={expenseId}
      runtimeFeatureFlags={await getRuntimeFeatureFlags()}
    />
  )
}
