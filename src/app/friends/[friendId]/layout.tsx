import { FriendLayoutClient } from '@/app/friends/[friendId]/friend-layout-client'
import { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  params: Promise<{ friendId: string }>
}>

export default async function FriendDetailLayout({ children, params }: Props) {
  const { friendId } = await params

  return <FriendLayoutClient friendId={friendId}>{children}</FriendLayoutClient>
}
