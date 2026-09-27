/**
 * Notification preferences service.
 *
 * Reads and writes account-level notification channel preferences
 * (`UserNotificationPreference`) and the master `User.notificationsEnabled`
 * switch. The effective state for a category is the stored row merged over the
 * design defaults (see `defaultChannelsFor`).
 *
 * Channels are persisted per user + category. The recurring-expense preference
 * is stored even though that path does not emit its own notification yet.
 */

import {
  LIVE_NOTIFICATION_CATEGORIES,
  type NotificationChannels,
  defaultChannelsFor,
  isLiveCategory,
} from '@/app/account/settings/notification-category-metadata'
import { prisma } from '@/lib/prisma'

export type NotificationPreferencesResult = {
  /** The master switch — when false, dispatch skips the user entirely. */
  notificationsEnabled: boolean
  /**
   * Effective channel state for every live (non-coming-soon) category, keyed by
   * category id. Stored rows override the design defaults.
   */
  categories: Record<string, NotificationChannels>
}

export type SaveNotificationCategoryError = {
  code: 'UNKNOWN_CATEGORY'
  message: string
}

export type SaveNotificationCategoryResult =
  | { ok: true }
  | { ok: false; error: SaveNotificationCategoryError }

/**
 * Returns the effective notification preferences for a user: the master switch
 * plus the merged channel state for every live category.
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferencesResult> {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { notificationsEnabled: true },
    }),
    prisma.userNotificationPreference.findMany({
      where: { userId },
      select: { category: true, email: true, push: true },
    }),
  ])

  const stored = new Map<string, NotificationChannels>(
    rows.map((row) => [row.category, { email: row.email, push: row.push }]),
  )

  const categories: Record<string, NotificationChannels> = {}
  for (const category of LIVE_NOTIFICATION_CATEGORIES) {
    categories[category.id] =
      stored.get(category.id) ?? defaultChannelsFor(category.id)
  }

  return {
    notificationsEnabled: user?.notificationsEnabled ?? true,
    categories,
  }
}

/**
 * Upserts the channel preference for a single (user, category) pair.
 *
 * Rejects unknown or coming-soon categories so callers cannot persist rows the
 * UI never exposes.
 */
export async function saveNotificationCategory(
  userId: string,
  category: string,
  channels: NotificationChannels,
): Promise<SaveNotificationCategoryResult> {
  if (!isLiveCategory(category)) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_CATEGORY',
        message: 'Unknown notification category.',
      },
    }
  }

  await prisma.userNotificationPreference.upsert({
    where: { userId_category: { userId, category } },
    create: {
      userId,
      category,
      email: channels.email,
      push: channels.push,
    },
    update: {
      email: channels.email,
      push: channels.push,
    },
  })

  return { ok: true }
}

/**
 * Batch-loads the account notification state for many users at once, avoiding an
 * N+1 when dispatch resolves preferences for every recipient of an activity.
 *
 * Returns a map keyed by user id. Each entry carries the master switch and the
 * effective channel state for every live category (stored rows merged over the
 * design defaults). Users with no `User` row default to `notificationsEnabled:
 * true`; users with no stored preference rows fall back to `defaultChannelsFor`.
 */
export async function getNotificationPreferencesForUsers(
  userIds: string[],
): Promise<Map<string, NotificationPreferencesResult>> {
  const distinct = Array.from(new Set(userIds))
  const result = new Map<string, NotificationPreferencesResult>()

  if (distinct.length === 0) {
    return result
  }

  const [users, rows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: distinct } },
      select: { id: true, notificationsEnabled: true },
    }),
    prisma.userNotificationPreference.findMany({
      where: { userId: { in: distinct } },
      select: { userId: true, category: true, email: true, push: true },
    }),
  ])

  const enabledByUser = new Map(
    users.map((u) => [u.id, u.notificationsEnabled]),
  )

  const storedByUser = new Map<string, Map<string, NotificationChannels>>()
  for (const row of rows) {
    let byCategory = storedByUser.get(row.userId)
    if (!byCategory) {
      byCategory = new Map<string, NotificationChannels>()
      storedByUser.set(row.userId, byCategory)
    }
    byCategory.set(row.category, { email: row.email, push: row.push })
  }

  for (const userId of distinct) {
    const stored = storedByUser.get(userId)
    const categories: Record<string, NotificationChannels> = {}
    for (const category of LIVE_NOTIFICATION_CATEGORIES) {
      categories[category.id] =
        stored?.get(category.id) ?? defaultChannelsFor(category.id)
    }
    result.set(userId, {
      notificationsEnabled: enabledByUser.get(userId) ?? true,
      categories,
    })
  }

  return result
}

/**
 * Decides whether a mapped notification category may be delivered on a channel,
 * given a user's account preferences. Returns `true` for unmapped categories
 * (`category === null`) so callers preserve the existing behavior for activity
 * types that have no account category.
 *
 * Pure: takes the already-resolved preferences, does no I/O.
 */
export function isCategoryChannelAllowed(
  prefs: NotificationPreferencesResult | undefined,
  category: string | null,
  channel: 'email' | 'push',
): boolean {
  // Unmapped activity types are not gated by account preferences.
  if (category === null) {
    return true
  }
  // Missing preferences (user unknown) default to the design defaults.
  if (!prefs) {
    return defaultChannelsFor(category)[channel]
  }
  // Master switch off skips the user entirely.
  if (!prefs.notificationsEnabled) {
    return false
  }
  const channels = prefs.categories[category] ?? defaultChannelsFor(category)
  return channels[channel]
}

/** Sets the master notification switch for a user. */
export async function setNotificationsEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsEnabled: enabled },
  })
}
