import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FriendTimelineWrapper } from './friend-timeline-wrapper'

type Props = {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${username} — Timeline`,
  }
}

export default async function FriendTimelinePage({ params }: Props) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  // Username is extracted from params for this dynamic route.
  // The friend record resolution and timeline data fetching happens
  // client-side via tRPC (friends.getFriendByUsername in the context
  // provider, and friends.getTimeline in the timeline view).
  const { username } = await params

  return <FriendTimelineWrapper username={username} />
}
