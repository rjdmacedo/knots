'use client'

import {
  DetailPageHeader,
  DetailPageLayout,
} from '@/components/detail-page-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { PropsWithChildren } from 'react'
import { FriendContextProvider } from './friend-context'

/**
 * Friend detail layout — the unified timeline is the default and only main view.
 * No tab navigation (expenses/balances tabs have been removed per Requirement 5.5).
 * Balance summary and actions are rendered inline within the timeline view itself.
 */
export function FriendLayoutClient({
  username,
  children,
}: PropsWithChildren<{ username: string }>) {
  return (
    <FriendContextProvider username={username}>
      <DetailPageLayout>
        <FriendHeader username={username} />
        {children}
      </DetailPageLayout>
    </FriendContextProvider>
  )
}

type FriendHeaderProps = {
  username: string
}

export function FriendHeader({ username }: FriendHeaderProps) {
  const t = useTranslations('Friends')
  const { data: friend, isLoading: friendIsLoading } =
    trpc.friends.getFriendByUsername.useQuery({ username })

  return (
    <DetailPageHeader
      backHref="/friends"
      backLabel={t('Expenses.backToFriends')}
      title={friendIsLoading ? <Skeleton className="h-7 w-48" /> : friend?.name}
    />
  )
}
