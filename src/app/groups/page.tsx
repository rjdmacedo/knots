import { MyGroups } from '@/app/groups/my-groups'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Groups',
}

export default async function GroupsPage() {
  return <MyGroups />
}
