import 'server-only'

import { scheduleGroupEmailDigestOnActivity } from '@/lib/email/group-activity-digest'
import { env } from '@/lib/env'
import { ActivityType } from '@prisma/client'
import { dispatchNotifications } from './dispatch-notifications'

/**
 * Fire-and-forget side effects after an activity is logged (push + email digest).
 * This module is server-only and must not be imported from client components.
 */
export function notifyOnActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: { userId?: string; expenseId?: string; data?: string },
): void {
  if (extra?.userId) {
    scheduleGroupEmailDigestOnActivity(groupId, extra.userId)
  }

  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return
  }

  dispatchNotifications(groupId, activityType, {
    userId: extra?.userId,
    expenseId: extra?.expenseId,
    data: extra?.data,
  }).catch((error) => {
    console.error('[push] Notification dispatch failed:', error)
  })
}
