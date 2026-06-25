import BalancesAndReimbursements from '@/app/groups/[groupId]/balances/balances-and-reimbursements'
import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Balances',
}

export default async function GroupBalancesPage() {
  const session = await auth()

  return <BalancesAndReimbursements currentUserId={session?.user?.id} />
}
