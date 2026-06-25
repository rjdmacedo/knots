'use client'

import { FriendBalanceSummary } from '@/app/friends/friend-balance-summary'
import {
  DetailPageHeader,
  DetailPageLayout,
  DetailPageTabs,
} from '@/components/detail-page-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { PropsWithChildren } from 'react'
import { FriendContextProvider } from './friend-context'

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
  const t = useTranslations('Friends.Expenses')
  const tTabs = useTranslations()
  const { data: friend, isLoading: friendIsLoading } =
    trpc.friends.getFriendByUsername.useQuery({ username })
  const { data: balanceDetail } = trpc.friends.getBalanceDetail.useQuery(
    { friendId: friend?.id ?? '' },
    { enabled: friend?.isConnected === true && !!friend?.id },
  )

  const basePath = `/friends/${username}`

  return (
    <DetailPageHeader
      backHref="/friends"
      backLabel={t('backToFriends')}
      title={
        friendIsLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          friend && t('title', { name: friend.name })
        )
      }
      description={t('description')}
      summary={
        balanceDetail ? (
          <FriendBalanceSummary
            balances={balanceDetail.balances}
            friendName={balanceDetail.friend.name}
          />
        ) : undefined
      }
      tabs={
        friend?.isConnected ? (
          <DetailPageTabs
            basePath={basePath}
            tabs={[
              { value: 'expenses', label: tTabs('Expenses.title') },
              { value: 'balances', label: tTabs('Balances.title') },
              { value: 'stats', label: tTabs('Stats.title') },
              { value: 'activity', label: tTabs('Activity.title') },
            ]}
          />
        ) : undefined
      }
    />
  )
}
