import { ExpenseDetail } from '@/components/expense-detail/expense-detail'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ groupId: string; expenseId: string }>
}

export const metadata: Metadata = {
  title: 'Expense details',
}

export default async function GroupExpenseDetailPage({ params }: Props) {
  const { groupId, expenseId } = await params

  return (
    <div className="px-4 py-6">
      <ExpenseDetail scope="group" groupId={groupId} expenseId={expenseId} />
    </div>
  )
}
