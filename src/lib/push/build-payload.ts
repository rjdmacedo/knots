import { ActivityType } from '@prisma/client'

export interface PushNotificationPayload {
  localeKey: string
  params: Record<string, string>
  url: string
}

const ACTIVITY_LOCALE_KEYS: Record<ActivityType, string> = {
  [ActivityType.CREATE_EXPENSE]: 'notifications.expenseCreated',
  [ActivityType.UPDATE_EXPENSE]: 'notifications.expenseUpdated',
  [ActivityType.DELETE_EXPENSE]: 'notifications.expenseDeleted',
  [ActivityType.UPDATE_GROUP]: 'notifications.groupUpdated',
}

const EXPENSE_ACTIVITY_TYPES: Set<ActivityType> = new Set([
  ActivityType.CREATE_EXPENSE,
  ActivityType.UPDATE_EXPENSE,
  ActivityType.DELETE_EXPENSE,
])

export function buildPushPayload(
  activityType: ActivityType,
  groupId: string,
  groupName: string,
  expenseTitle?: string,
  actorName?: string,
): PushNotificationPayload {
  const localeKey = ACTIVITY_LOCALE_KEYS[activityType]

  const isExpenseActivity = EXPENSE_ACTIVITY_TYPES.has(activityType)

  const params: Record<string, string> = isExpenseActivity
    ? { title: expenseTitle ?? '', group: groupName, actor: actorName ?? '' }
    : { group: groupName, actor: actorName ?? '' }

  const url = isExpenseActivity
    ? `/groups/${groupId}/expenses`
    : `/groups/${groupId}`

  return { localeKey, params, url }
}
