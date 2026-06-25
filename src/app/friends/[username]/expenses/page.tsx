import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FriendExpensesWrapper } from './friend-expenses-wrapper'

export const metadata: Metadata = {
  title: 'Friend Expenses',
}

export default async function FriendExpensesPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  return <FriendExpensesWrapper />
}
