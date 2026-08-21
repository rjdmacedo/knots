'use client'

import {
  ActivityItem,
  type ActivityGroup,
} from '@/app/groups/[groupId]/activity/activity-item'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { forwardRef, useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpinDelay } from 'spin-delay'

const PAGE_SIZE = 20

const ActivitiesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="flex flex-col gap-3">
      {Array(3)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="flex gap-2 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
    </div>
  )
})
ActivitiesLoading.displayName = 'ActivitiesLoading'

type Props = {
  groupId: string
  expenseId: string
  group: ActivityGroup
}

export function ExpenseActivityList({ groupId, expenseId, group }: Props) {
  const t = useTranslations('ExpenseDetail')
  const tActivity = useTranslations('Activity')

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories ?? []

  const {
    data: activitiesData,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.groups.activities.list.useInfiniteQuery(
    { groupId, expenseId, limit: PAGE_SIZE },
    { getNextPageParam: ({ nextCursor }) => nextCursor },
  )
  const { ref: loadingRef, inView } = useInView()

  const activities = activitiesData?.pages.flatMap((page) => page.activities)
  const hasMore = activitiesData?.pages.at(-1)?.hasMore ?? false

  const isInitialLoading = useSpinDelay(isLoading && !activitiesData, {
    delay: 200,
    minDuration: 300,
  })

  useEffect(() => {
    if (inView && hasMore && !isInitialLoading && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasMore, inView, isInitialLoading, isFetchingNextPage])

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <p className="text-sm text-muted-foreground">{tActivity('error')}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {tActivity('retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-2 text-sm font-semibold">{t('activity')}</h2>
        {isInitialLoading ? (
          <ActivitiesLoading />
        ) : !activities || activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noActivity')}</p>
        ) : (
          <div className="-mx-2">
            {activities.map((activity) => {
              const participant =
                activity.participantId !== null
                  ? group.participants.find(
                      (p) => p.id === activity.participantId,
                    )
                  : undefined

              return (
                <ActivityItem
                  key={activity.id}
                  groupId={groupId}
                  activity={activity}
                  group={group}
                  participant={
                    participant
                      ? { id: participant.id, name: participant.name }
                      : undefined
                  }
                  dateStyle="medium"
                  categories={categories}
                  linkToExpense={false}
                  summaryContext="expense"
                />
              )
            })}
            {hasMore && <ActivitiesLoading ref={loadingRef} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
