import { cached } from '@/app/cached-functions'
import GroupInformation from '@/app/groups/[groupSlug]/information/group-information'
import { GroupType } from '@prisma/client'
import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Group Information',
}

export default async function InformationPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>
}) {
  const { groupSlug } = await params
  const group = await cached.getGroupBySlug(groupSlug)

  if (!group) {
    notFound()
  }

  if (group.type === GroupType.DYAD) {
    redirect(`/groups/${groupSlug}/expenses`)
  }

  return <GroupInformation groupId={group.id} />
}
