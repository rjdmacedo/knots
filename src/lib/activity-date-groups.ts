import dayjs, { type Dayjs } from 'dayjs'

export const ACTIVITY_DATE_GROUPS = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  EARLIER_THIS_WEEK: 'earlierThisWeek',
  LAST_WEEK: 'lastWeek',
  EARLIER_THIS_MONTH: 'earlierThisMonth',
  LAST_MONTH: 'lastMonth',
  EARLIER_THIS_YEAR: 'earlierThisYear',
  LAST_YEAR: 'lastYear',
  OLDER: 'older',
} as const

export const ACTIVITY_DATE_GROUP_ORDER = Object.values(ACTIVITY_DATE_GROUPS)

export function getActivityDateGroup(date: Dayjs, today: Dayjs) {
  if (today.isSame(date, 'day')) {
    return ACTIVITY_DATE_GROUPS.TODAY
  } else if (today.subtract(1, 'day').isSame(date, 'day')) {
    return ACTIVITY_DATE_GROUPS.YESTERDAY
  } else if (today.isSame(date, 'week')) {
    return ACTIVITY_DATE_GROUPS.EARLIER_THIS_WEEK
  } else if (today.subtract(1, 'week').isSame(date, 'week')) {
    return ACTIVITY_DATE_GROUPS.LAST_WEEK
  } else if (today.isSame(date, 'month')) {
    return ACTIVITY_DATE_GROUPS.EARLIER_THIS_MONTH
  } else if (today.subtract(1, 'month').isSame(date, 'month')) {
    return ACTIVITY_DATE_GROUPS.LAST_MONTH
  } else if (today.isSame(date, 'year')) {
    return ACTIVITY_DATE_GROUPS.EARLIER_THIS_YEAR
  } else if (today.subtract(1, 'year').isSame(date, 'year')) {
    return ACTIVITY_DATE_GROUPS.LAST_YEAR
  } else {
    return ACTIVITY_DATE_GROUPS.OLDER
  }
}

function compareActivitiesByTimeDesc<
  T extends { time: Date | string; id: string },
>(a: T, b: T) {
  const timeDiff = dayjs(b.time).valueOf() - dayjs(a.time).valueOf()
  if (timeDiff !== 0) return timeDiff
  return b.id.localeCompare(a.id)
}

export function groupActivitiesByDate<
  T extends { time: Date | string; id: string },
>(activities: T[]) {
  const today = dayjs()
  const result = activities.reduce(
    (result, activity) => {
      const activityGroup = getActivityDateGroup(dayjs(activity.time), today)
      result[activityGroup] = result[activityGroup] ?? []
      result[activityGroup].push(activity)
      return result
    },
    {} as Record<string, T[]>,
  )

  for (const activitiesInGroup of Object.values(result)) {
    activitiesInGroup.sort(compareActivitiesByTimeDesc)
  }

  return result
}
