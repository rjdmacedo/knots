import { Metadata } from 'next'
import { FriendBalancesWrapper } from '../friend-balances-wrapper'

export const metadata: Metadata = {
  title: 'Balances',
}

export default function FriendBalancesPage() {
  return <FriendBalancesWrapper />
}
