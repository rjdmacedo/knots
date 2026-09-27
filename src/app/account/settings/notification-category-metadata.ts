/**
 * Notification category metadata.
 *
 * Pure, framework-free module shared by both the server (dispatch and default
 * resolution) and the client (notification preferences UI). It lists the
 * notification groups and their categories in display order.
 *
 * Labels and descriptions are NOT stored here — they are resolved from i18n
 * keys at render time (see task 7.3). Each category carries the i18n key
 * fragments so the UI can build the full key, but no English strings.
 *
 * Category ids match the design's "Category map" table exactly.
 */

/** Display groups, in render order. */
export const NOTIFICATION_GROUPS = [
  'groups-and-friends',
  'expenses',
  'summaries',
] as const

export type NotificationGroupId = (typeof NOTIFICATION_GROUPS)[number]

/** A single notification category shown in the settings UI. */
export type NotificationCategory = {
  /** Stable category id, persisted in `UserNotificationPreference.category`. */
  id: string
  /** The group this category renders under. */
  group: NotificationGroupId
  /**
   * i18n key fragment under `ProfileSettings.notifications.categories`.
   * The UI builds `<fragment>.label` / `<fragment>.description` from it.
   * Defaults to `id` when omitted.
   */
  i18nKey?: string
  /**
   * When true, the category is a placeholder: it renders a single "Coming soon"
   * badge with no channel control, has no stored row and no default channels.
   */
  comingSoon?: boolean
}

/**
 * All categories in display order. The ordering here is the source of truth for
 * how rows are rendered within each group.
 */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  // Groups and friends
  { id: 'added-to-group', group: 'groups-and-friends' },
  { id: 'friend-added', group: 'groups-and-friends' },

  // Expenses
  { id: 'expense-created', group: 'expenses' },
  { id: 'recurring-expense-created', group: 'expenses' },
  { id: 'expense-changed', group: 'expenses' },

  // Summaries (coming soon, no channel control)
  { id: 'weekly-summary', group: 'summaries', comingSoon: true },
] as const

/** The channel flags stored per user and category. */
export type NotificationChannels = {
  email: boolean
  push: boolean
}

/**
 * Default channels applied when no `UserNotificationPreference` row exists for a
 * category (design: "Default channels when no row exists").
 *
 * Coming-soon categories are intentionally absent — they have no row and no
 * default.
 */
const DEFAULT_CHANNELS: Record<string, NotificationChannels> = {
  'added-to-group': { email: true, push: true },
  'friend-added': { email: true, push: true },
  'expense-created': { email: true, push: true },
  'recurring-expense-created': { email: true, push: false },
}

/** Categories that are rendered but not yet emitted/controllable. */
export function isComingSoon(category: string): boolean {
  return NOTIFICATION_CATEGORIES.some(
    (c) => c.id === category && c.comingSoon === true,
  )
}

/** Live (non-coming-soon) categories, in display order. */
export const LIVE_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] =
  NOTIFICATION_CATEGORIES.filter((c) => !c.comingSoon)

/** True when `category` is a known, live (controllable) category. */
export function isLiveCategory(category: string): boolean {
  return LIVE_NOTIFICATION_CATEGORIES.some((c) => c.id === category)
}

/**
 * Default channel set for a category when the user has no stored preference.
 *
 * Live categories return their design default. Coming-soon or unknown
 * categories have no row, so they return both channels off.
 */
export function defaultChannelsFor(category: string): NotificationChannels {
  const defaults = DEFAULT_CHANNELS[category]
  return defaults ? { ...defaults } : { email: false, push: false }
}

/**
 * The `ActivityType` enum values, listed here as literal strings so this module
 * stays framework-free (no `@prisma/client` import). Callers pass the enum
 * value, which is one of these strings.
 */
export type ActivityTypeValue =
  | 'UPDATE_GROUP'
  | 'CREATE_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'

/**
 * Maps a Knots `ActivityType` to the account-level notification category that
 * gates its dispatch (design "Category map"). Returns `null` for activity types
 * that have no account category (e.g. `UPDATE_GROUP`), so callers preserve the
 * current behavior for unmapped types rather than newly suppressing them.
 *
 * Pure and testable — no side effects, no I/O.
 */
export function activityTypeToNotificationCategory(
  activityType: ActivityTypeValue,
): string | null {
  switch (activityType) {
    case 'CREATE_EXPENSE':
      return 'expense-created'
    case 'UPDATE_EXPENSE':
    case 'DELETE_EXPENSE':
      return 'expense-changed'
    default:
      // UPDATE_GROUP and any future type without an account category.
      return null
  }
}
