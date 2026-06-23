import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FriendExpenses } from './friend-expenses'

export const metadata: Metadata = {
  title: 'Friend Expenses',
}

export default async function FriendExpensesPage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  const { friendId } = await params

  return <FriendExpenses friendId={friendId} />
}
