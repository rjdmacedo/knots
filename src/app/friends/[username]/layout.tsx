import { FriendLayoutClient } from '@/app/friends/[username]/friend-layout-client'
import { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  params: Promise<{ username: string }>
}>

export default async function FriendDetailLayout({ children, params }: Props) {
  const { username } = await params

  return <FriendLayoutClient username={username}>{children}</FriendLayoutClient>
}
