import { NewGroupExpensePageClient } from '@/app/groups/[groupId]/expenses/new/page.client'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ groupId: string }>
}

export const metadata: Metadata = {
  title: 'New expense',
}

export default async function NewGroupExpensePage({ params }: Props) {
  const { groupId } = await params

  return <NewGroupExpensePageClient groupId={groupId} />
}
