'use client'

import { GroupHeader } from '@/app/groups/[groupId]/group-header'
import { DetailPageLayout } from '@/components/detail-page-layout'
import { trpc } from '@/trpc/client'
import { TRPCClientError } from '@trpc/client'
import { notFound } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { CurrentGroupProvider } from './current-group-context'

export function GroupLayoutClient({
  groupId,
  children,
}: PropsWithChildren<{ groupId: string }>) {
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
      ? { isLoading: true as const, groupId, group: undefined }
      : { isLoading: false as const, groupId, group: data.group }

  const showHeader = true

  return (
    <CurrentGroupProvider {...props}>
      <DetailPageLayout>
        {showHeader && <GroupHeader />}
        {children}
      </DetailPageLayout>
    </CurrentGroupProvider>
  )
}
