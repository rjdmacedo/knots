'use client'

import {
  ActivityItem,
  type Activity,
  type ActivityGroup,
} from '@/app/groups/[groupId]/activity/activity-item'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ACTIVITY_DATE_GROUP_ORDER,
  groupActivitiesByDate,
} from '@/lib/activity-date-groups'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { forwardRef, useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpinDelay } from 'spin-delay'

const PAGE_SIZE = 20

type GlobalActivity = Activity & { group: ActivityGroup }

const ActivitiesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="flex flex-col">
      <Skeleton className="mt-2 h-3 w-24 mx-6" />
      {Array(5)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="px-4 py-4">
            <Skeleton className="mb-2 h-5 w-24" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
    </div>
  )
})
ActivitiesLoading.displayName = 'ActivitiesLoading'

export function GlobalActivityList() {
  const t = useTranslations('Activity')

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories ?? []

  const {
    data: activitiesData,
    isLoading: activitiesAreLoading,
    fetchNextPage,
  } = trpc.activities.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: ({ nextCursor }) => nextCursor,
      staleTime: 0,
      refetchOnMount: 'always',
    },
  )
  const { ref: loadingRef, inView } = useInView()

  const activities = activitiesData?.pages.flatMap(
    (page) => page.activities,
  ) as GlobalActivity[] | undefined
  const hasMore = activitiesData?.pages.at(-1)?.hasMore ?? false

  const isLoading = useSpinDelay(activitiesAreLoading || !activities, {
    delay: 200,
    minDuration: 300,
  })

  useEffect(() => {
    if (inView && hasMore && !isLoading) fetchNextPage()
  }, [fetchNextPage, hasMore, inView, isLoading])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="p-0">
          <ActivitiesLoading />
        </CardContent>
      </Card>
    )
  }

  if (!activities) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          <ActivitiesLoading />
        </CardContent>
      </Card>
    )
  }

  const groupedActivitiesByDate = groupActivitiesByDate(activities)

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>{t('globalListTitle')}</CardTitle>
        <CardDescription>{t('globalListDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {activities.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {t('globalNoActivity')}
          </p>
        ) : (
          <>
            {ACTIVITY_DATE_GROUP_ORDER.map((dateGroup) => {
              const groupActivities = groupedActivitiesByDate[dateGroup]
              if (!groupActivities || groupActivities.length === 0) return null
              const dateStyle =
                dateGroup === 'today' || dateGroup === 'yesterday'
                  ? undefined
                  : 'medium'

              return (
                <div key={dateGroup}>
                  <div className="text-xs py-1 font-semibold sticky top-0 z-10 bg-background px-6">
                    {t(`Groups.${dateGroup}`)}
                  </div>
                  {groupActivities.map((activity) => {
                    const participant =
                      activity.participantId !== null
                        ? activity.group.participants.find(
                            (p) => p.id === activity.participantId,
                          )
                        : undefined

                    return (
                      <div key={activity.id}>
                        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                          <Link
                            href={`/groups/${activity.groupId}`}
                            className="hover:underline"
                          >
                            <Badge variant="outline">
                              {activity.group.name}
                            </Badge>
                          </Link>
                        </div>
                        <ActivityItem
                          groupId={activity.groupId}
                          activity={activity}
                          group={activity.group}
                          participant={participant}
                          dateStyle={dateStyle}
                          categories={categories}
                          variant="card"
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {hasMore && <ActivitiesLoading ref={loadingRef} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}
