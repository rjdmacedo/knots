import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ username: string }>
}

export default async function FriendDetailPage({ params }: Props) {
  const { username } = await params
  redirect(`/friends/${username}/expenses`)
}
