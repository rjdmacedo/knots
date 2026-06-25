import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FriendBalanceWrapper } from './friend-balance-wrapper'

export const metadata: Metadata = {
  title: 'Friend Balance',
}

export default async function FriendBalancePage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  return <FriendBalanceWrapper />
}
