import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FriendBalanceDetail } from './friend-balance-detail'

export const metadata: Metadata = {
  title: 'Friend Balance',
}

export default async function FriendBalancePage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  const { friendId } = await params

  return <FriendBalanceDetail friendId={friendId} />
}
