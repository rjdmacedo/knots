import { ExpenseDetail } from '@/components/expense-detail/expense-detail'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ username: string; expenseId: string }>
}

export const metadata: Metadata = {
  title: 'Payment details',
}

export default async function FriendPaymentDetailPage({ params }: Props) {
  const { username, expenseId } = await params

  return (
    <ExpenseDetail
      scope="friend-payment"
      username={username}
      expenseId={expenseId}
    />
  )
}
