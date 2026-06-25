'use client'

import { GroupHeader } from '@/app/groups/[groupSlug]/group-header'
import { DetailPageLayout } from '@/components/detail-page-layout'
import { trpc } from '@/trpc/client'
import { GroupType } from '@prisma/client'
import { TRPCClientError } from '@trpc/client'
import { notFound } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { CurrentGroupProvider } from './current-group-context'

function shouldShowGroupHeader(groupType?: GroupType) {
  return groupType !== GroupType.DYAD
}

export function GroupLayoutClient({
  groupId,
  groupSlug,
  children,
}: PropsWithChildren<{ groupId: string; groupSlug: string }>) {
  const { data, isLoading, isError, error } = trpc.groups.get.useQuery({
    groupId,
  })

  if (!isLoading) {
    if (
      isError &&
      error instanceof TRPCClientError &&
      error.data?.code === 'NOT_FOUND'
    ) {
      notFound()
    }
    if (data && !data.group) {
      notFound()
    }
  }

  const props =
    isLoading || !data?.group
      ? {
          isLoading: true as const,
          groupId,
          groupSlug,
          group: undefined,
        }
      : {
          isLoading: false as const,
          groupId,
          groupSlug,
          group: data.group,
        }

  const showHeader = shouldShowGroupHeader(data?.group?.type)

  return (
    <CurrentGroupProvider {...props}>
      <DetailPageLayout>
        {showHeader && <GroupHeader />}
        {children}
      </DetailPageLayout>
    </CurrentGroupProvider>
  )
}
