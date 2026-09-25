import { GroupExpenseEditPageClient } from '@/app/groups/[groupId]/expenses/[expenseId]/edit/page.client'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ groupId: string; expenseId: string }>
}

export const metadata: Metadata = {
  title: 'Edit expense',
}

export default async function GroupExpenseEditPage({ params }: Props) {
  const { groupId, expenseId } = await params

  return <GroupExpenseEditPageClient groupId={groupId} expenseId={expenseId} />
}
