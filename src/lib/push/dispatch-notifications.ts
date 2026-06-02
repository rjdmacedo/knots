import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { ActivityType } from '@prisma/client'
import webpush, { WebPushError } from 'web-push'
import { buildPushPayload } from './build-payload'
import { isPushSubscriptionEligible } from './subscription-filters'

const EXPENSE_ACTIVITY_TYPES: Set<ActivityType> = new Set([
  ActivityType.CREATE_EXPENSE,
  ActivityType.UPDATE_EXPENSE,
  ActivityType.DELETE_EXPENSE,
])

/**
 * Sends push notifications to all eligible subscriptions for a group
 * when an activity occurs. Filters out self-notifications and cleans up
 * stale subscriptions (HTTP 410/404).
 */
export async function dispatchNotifications(
  groupId: string,
  activityType: ActivityType,
  extra: { userId?: string; expenseId?: string; data?: string },
): Promise<void> {
  const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('[push] No VAPID keys configured, skipping dispatch')
    return
  }

  // Query all subscriptions for the group
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { groupId },
  })

  console.log(
    `[push] Found ${subscriptions.length} subscription(s) for group ${groupId}`,
  )

  if (subscriptions.length === 0) {
    return
  }

  const eligible = subscriptions.filter((sub) =>
    isPushSubscriptionEligible(sub, activityType, extra.userId),
  )

  if (eligible.length === 0) {
    console.log('[push] No eligible subscriptions after filtering')
    return
  }

  // Fetch group name and expense title for the payload
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      memberships: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  const groupName = group?.name ?? ''

  // Resolve actor name from userId
  const actorName = extra.userId
    ? group?.memberships?.find((m) => m.user.id === extra.userId)?.user
        .name
    : undefined

  let expenseTitle: string | undefined
  if (EXPENSE_ACTIVITY_TYPES.has(activityType) && extra.expenseId) {
    const expense = await prisma.expense.findUnique({
      where: { id: extra.expenseId },
      select: { title: true },
    })
    expenseTitle = expense?.title
  }

  // Build the push payload
  const payload = buildPushPayload(
    activityType,
    groupId,
    groupName,
    expenseTitle,
    actorName,
  )
  const payloadString = JSON.stringify(payload)

  // Configure VAPID and send to each eligible subscription
  // VAPID subject must be https: or mailto: URL per web-push spec.
  // In development (http://localhost), use a mailto: fallback.
  const vapidSubject = env.NEXT_PUBLIC_BASE_URL.startsWith('https://')
    ? env.NEXT_PUBLIC_BASE_URL
    : 'mailto:dev@localhost'

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const sendPromises = eligible.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    }

    try {
      await webpush.sendNotification(pushSubscription, payloadString)
    } catch (error: unknown) {
      const statusCode =
        error instanceof WebPushError ? error.statusCode : undefined

      if (statusCode === 410 || statusCode === 404) {
        // Subscription is no longer valid, remove it
        await prisma.pushSubscription
          .delete({
            where: { id: sub.id },
          })
          .catch(() => {
            // Ignore deletion errors (e.g., already deleted)
          })
      } else {
        // Log other errors without retrying
        console.error(
          `[push] Failed to send notification to subscription ${sub.id}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  })

  await Promise.all(sendPromises)
}
