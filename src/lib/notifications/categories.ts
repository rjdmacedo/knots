export const NOTIFICATION_GROUPS = [
  'groups-and-friends',
  'expenses',
  'summaries',
] as const

export type NotificationGroupId = (typeof NOTIFICATION_GROUPS)[number]

export type NotificationCategory = {
  id: string
  group: NotificationGroupId
  i18nKey?: string
  comingSoon?: boolean
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  { id: 'added-to-group', group: 'groups-and-friends' },
  { id: 'friend-added', group: 'groups-and-friends' },
  { id: 'expense-created', group: 'expenses' },
  { id: 'recurring-expense-created', group: 'expenses' },
  { id: 'expense-changed', group: 'expenses' },
  { id: 'weekly-summary', group: 'summaries', comingSoon: true },
] as const

export type NotificationChannels = {
  email: boolean
  push: boolean
}

const DEFAULT_CHANNELS: Record<string, NotificationChannels> = {
  'added-to-group': { email: true, push: true },
  'friend-added': { email: true, push: true },
  'expense-created': { email: true, push: true },
  'recurring-expense-created': { email: true, push: false },
}

export function isComingSoon(category: string): boolean {
  return NOTIFICATION_CATEGORIES.some(
    (candidate) => candidate.id === category && candidate.comingSoon === true,
  )
}

export const LIVE_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] =
  NOTIFICATION_CATEGORIES.filter((category) => !category.comingSoon)

export const EXPENSE_NOTIFICATION_CATEGORY_IDS = [
  'expense-created',
  'recurring-expense-created',
  'expense-changed',
] as const

export type ExpenseNotificationCategoryId =
  (typeof EXPENSE_NOTIFICATION_CATEGORY_IDS)[number]

export function isExpenseNotificationCategory(
  category: string,
): category is ExpenseNotificationCategoryId {
  return EXPENSE_NOTIFICATION_CATEGORY_IDS.some((id) => id === category)
}

export function isLiveCategory(category: string): boolean {
  return LIVE_NOTIFICATION_CATEGORIES.some(
    (candidate) => candidate.id === category,
  )
}

export function defaultChannelsFor(category: string): NotificationChannels {
  const defaults = DEFAULT_CHANNELS[category]
  return defaults ? { ...defaults } : { email: false, push: false }
}

export type ActivityTypeValue =
  | 'UPDATE_GROUP'
  | 'CREATE_EXPENSE'
  | 'CREATE_RECURRING_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'

export function activityTypeToNotificationCategory(
  activityType: ActivityTypeValue,
): string | null {
  switch (activityType) {
    case 'CREATE_EXPENSE':
      return 'expense-created'
    case 'CREATE_RECURRING_EXPENSE':
      return 'recurring-expense-created'
    case 'UPDATE_EXPENSE':
    case 'DELETE_EXPENSE':
      return 'expense-changed'
    default:
      return null
  }
}
