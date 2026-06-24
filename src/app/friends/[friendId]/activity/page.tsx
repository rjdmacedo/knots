import { FriendActivityList } from '@/app/friends/[friendId]/activity/friend-activity-list'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Friend Activity',
}

export default async function FriendActivityPage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const { friendId } = await params
  return <FriendActivityList friendId={friendId} />
}
