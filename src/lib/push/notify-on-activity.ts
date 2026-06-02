import 'server-only'

import { env } from '@/lib/env'
import { ActivityType } from '@prisma/client'
import { dispatchNotifications } from './dispatch-notifications'

/**
 * Fire-and-forget notification dispatch after an activity is logged.
 * This module is server-only and must not be imported from client components.
 */
export function notifyOnActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: { userId?: string; expenseId?: string; data?: string },
): void {
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
