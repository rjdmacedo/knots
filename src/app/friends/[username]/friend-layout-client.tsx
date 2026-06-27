'use client'

import {
  DetailPageHeader,
  DetailPageLayout,
  DetailPageTabs,
} from '@/components/detail-page-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { isFriendExpenseDetailPath } from '@/lib/expense-detail-urls'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { FriendContextProvider } from './friend-context'

export function FriendLayoutClient({
  username,
  children,
}: PropsWithChildren<{ username: string }>) {
  const pathname = usePathname()
  const showHeader = !isFriendExpenseDetailPath(pathname)

  return (
    <FriendContextProvider username={username}>
      <DetailPageLayout>
        {showHeader ? <FriendHeader username={username} /> : null}
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
  const tTabs = useTranslations()
  const { data: friend, isLoading: friendIsLoading } =
    trpc.friends.getFriendByUsername.useQuery({ username })

  const basePath = `/friends/${username}`
  const tabs = [
    { value: 'expenses', label: tTabs('Expenses.title') },
    { value: 'balances', label: tTabs('Balances.title') },
    { value: 'stats', label: tTabs('Stats.title') },
    { value: 'activity', label: tTabs('Activity.title') },
    { value: 'settings', label: tTabs('Settings.title') },
  ]

  return (
    <DetailPageHeader
      backHref="/friends"
      backLabel={t('Expenses.backToFriends')}
      title={friendIsLoading ? <Skeleton className="h-7 w-48" /> : friend?.name}
      tabs={<DetailPageTabs basePath={basePath} tabs={tabs} />}
    />
  )
}
