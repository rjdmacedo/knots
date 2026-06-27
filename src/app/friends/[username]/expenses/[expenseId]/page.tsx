import { ExpenseDetail } from '@/components/expense-detail/expense-detail'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ username: string; expenseId: string }>
}

export const metadata: Metadata = {
  title: 'Expense details',
}

export default async function DirectExpenseDetailPage({ params }: Props) {
  const { username, expenseId } = await params

  return (
    <div className="px-4 py-6">
      <ExpenseDetail scope="direct" username={username} expenseId={expenseId} />
    </div>
  )
}
