import { Metadata } from 'next'
import { FriendActivityWrapper } from './friend-activity-wrapper'

export const metadata: Metadata = {
  title: 'Friend Activity',
}

export default async function FriendActivityPage() {
  return <FriendActivityWrapper />
}
