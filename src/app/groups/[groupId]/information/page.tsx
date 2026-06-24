import { cached } from '@/app/cached-functions'
import GroupInformation from '@/app/groups/[groupId]/information/group-information'
import { GroupType } from '@prisma/client'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Group Information',
}

export default async function InformationPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const group = await cached.getGroup(groupId)

  if (group?.type === GroupType.DYAD) {
    redirect(`/groups/${groupId}/expenses`)
  }

  return <GroupInformation groupId={groupId} />
}
