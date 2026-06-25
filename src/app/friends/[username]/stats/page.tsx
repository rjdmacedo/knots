import { Metadata } from 'next'
import { FriendStatsWrapper } from './friend-stats-wrapper'

export const metadata: Metadata = {
  title: 'Friend Stats',
}

export default async function FriendStatsPage() {
  return <FriendStatsWrapper />
}
