'use client'
import {
  ActivityItem,
  type Activity,
  type ActivityGroup,
} from '@/app/groups/[groupId]/activity/activity-item'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ACTIVITY_DATE_GROUP_ORDER,
  groupActivitiesByDate,
} from '@/lib/activity-date-groups'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { forwardRef, useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpinDelay } from 'spin-delay'

const PAGE_SIZE = 20

type GlobalActivity = Activity & { group: ActivityGroup }

const ActivitiesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <Skeleton className="mt-2 h-3 w-24" />
      {Array(5)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="flex gap-2 p-2">
            <div className="flex-0">
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex-1">
              <Skeleton className="h-3 w-48" />
            </div>
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
    { getNextPageParam: ({ nextCursor }) => nextCursor },
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

  if (isLoading) return <ActivitiesLoading />

  if (!activities) return <ActivitiesLoading />

  const groupedActivitiesByDate = groupActivitiesByDate(activities)

  return activities.length > 0 ? (
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
            <div className="text-xs py-1 font-semibold sticky top-0 bg-background -mx-4 px-4">
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
                <ActivityItem
                  key={activity.id}
                  groupId={activity.groupId}
                  activity={activity}
                  group={activity.group}
                  participant={participant}
                  dateStyle={dateStyle}
                  categories={categories}
                  showGroupName
                />
              )
            })}
          </div>
        )
      })}
      {hasMore && <ActivitiesLoading ref={loadingRef} />}
    </>
  ) : (
    <p className="text-sm py-6">{t('globalNoActivity')}</p>
  )
}
