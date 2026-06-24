import { FriendStats } from '@/app/friends/[friendId]/stats/friend-stats'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Friend Stats',
}

export default async function FriendStatsPage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const { friendId } = await params
  return <FriendStats friendId={friendId} />
}
