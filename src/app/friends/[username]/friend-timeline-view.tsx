'use client'

import { useFriendContext } from '@/app/friends/[username]/friend-context'
import {
  EXPENSE_DATE_GROUPS,
  type ExpenseDateGroup,
  getExpenseDateGroup,
} from '@/app/groups/[groupId]/expenses/grouped-expense-cards'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TimelineEntry } from '@/lib/friend-timeline'
import { trpc } from '@/trpc/client'
import dayjs from 'dayjs'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useSpinDelay } from 'spin-delay'
import { FriendTimeline } from './friend-timeline'

type Props = {
  friendId: string
}

export function FriendTimelineView({ friendId }: Props) {
  const t = useTranslations('Friends.Timeline')
  const tGroups = useTranslations('Friends.Timeline.groups')
  const { username } = useFriendContext()

  const {
    data,
    isLoading: queryIsLoading,
    isError,
    refetch,
  } = trpc.friends.getTimeline.useQuery({ friendId })

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  const groupedEntries = useMemo(() => {
    if (!data?.entries) return null
    return groupTimelineEntriesByDate(
      data.entries as unknown as TimelineEntry[],
    )
  }, [data?.entries])

  if (isLoading) {
    return <TimelineSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  const { currentUserId, entries } = data
  const timelineEntries = entries as unknown as TimelineEntry[]

  return (
    <div className="flex flex-col gap-4">
      {timelineEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t('empty')}
        </p>
      ) : (
        <div className="flex flex-col">
          {Object.values(EXPENSE_DATE_GROUPS).map((dateGroup) => {
            const groupItems = groupedEntries?.[dateGroup]
            if (!groupItems || groupItems.length === 0) return null

            return (
              <div key={dateGroup}>
                <div className="text-xs py-2 font-semibold sticky top-0 z-10 bg-background px-4 text-muted-foreground uppercase tracking-wide">
                  {tGroups(dateGroup)}
                </div>
                <FriendTimeline
                  entries={groupItems}
                  currentUserId={currentUserId}
                  friendUsername={username}
                  friendName={data.friend.name}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getTimelineEntryDate(entry: TimelineEntry): Date {
  switch (entry.type) {
    case 'GROUP_SUMMARY':
      return entry.activityDate
    case 'EXPENSE':
      return entry.expenseDate
    case 'PAYMENT':
      return entry.expenseDate
  }
}

function groupTimelineEntriesByDate(
  entries: TimelineEntry[],
): Partial<Record<ExpenseDateGroup, TimelineEntry[]>> {
  const today = dayjs()
  return entries.reduce(
    (result: Partial<Record<ExpenseDateGroup, TimelineEntry[]>>, entry) => {
      const group = getExpenseDateGroup(
        dayjs(getTimelineEntryDate(entry)),
        today,
      )
      result[group] = result[group] ?? []
      result[group].push(entry)
      return result
    },
    {},
  )
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}
