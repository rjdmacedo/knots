import {
  activityTypeToNotificationCategory,
  defaultChannelsFor,
  type NotificationChannels,
} from '@/lib/notifications/categories'
import type {
  NotificationEmailTemplate,
  NotificationSnapshot,
} from '@/lib/notifications/types'
import {
  buildAccountPushPayload,
  buildPushPayload,
} from '@/lib/push/build-payload'
import {
  ActivityType,
  NotificationDeliveryChannel,
  type Prisma,
} from '@prisma/client'

type Transaction = Prisma.TransactionClient

type Recipient = {
  userId?: string
  email: string
  locale?: string | null
}

type AccountNotificationInput = {
  eventKey: string
  category: 'added-to-group' | 'friend-added'
  recipient: Recipient
  template: NotificationEmailTemplate
  url: string
  params: Record<string, string | boolean>
}

type GroupActivityInput = {
  eventKey: string
  groupId: string
  activityType: ActivityType
  actorUserId?: string
  expenseId?: string
  expenseTitle?: string
}

function recipientKey(recipient: Recipient): string {
  return recipient.userId
    ? `user:${recipient.userId}`
    : `email:${recipient.email.trim().toLowerCase()}`
}

async function effectiveChannels(
  tx: Transaction,
  userId: string | undefined,
  category: string,
  override?: NotificationChannels,
): Promise<NotificationChannels> {
  if (!userId) return defaultChannelsFor(category)

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      notificationsEnabled: true,
      notificationPreferences: {
        where: { category },
        select: { email: true, push: true },
      },
    },
  })

  if (user && !user.notificationsEnabled) {
    return { email: false, push: false }
  }

  return (
    override ?? user?.notificationPreferences[0] ?? defaultChannelsFor(category)
  )
}

async function createDeliveries(
  tx: Transaction,
  deliveries: Array<{
    eventKey: string
    recipientKey: string
    recipientUserId?: string
    category: string
    channel: NotificationDeliveryChannel
    targetKey: string
    snapshot: NotificationSnapshot
  }>,
): Promise<number> {
  if (deliveries.length === 0) return 0

  const result = await tx.notificationDelivery.createMany({
    data: deliveries.map((delivery) => ({
      ...delivery,
      recipientUserId: delivery.recipientUserId ?? null,
      snapshot: delivery.snapshot as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  })
  return result.count
}

/**
 * Plans an account-directed event inside the caller's domain transaction.
 * Missing accounts use system defaults and can only produce email.
 */
export async function planAccountNotification(
  tx: Transaction,
  input: AccountNotificationInput,
): Promise<number> {
  const channels = await effectiveChannels(
    tx,
    input.recipient.userId,
    input.category,
  )
  const key = recipientKey(input.recipient)
  const locale = input.recipient.locale || 'en-US'
  const deliveries: Parameters<typeof createDeliveries>[1] = []

  if (channels.email && input.recipient.email.trim()) {
    deliveries.push({
      eventKey: input.eventKey,
      recipientKey: key,
      recipientUserId: input.recipient.userId,
      category: input.category,
      channel: NotificationDeliveryChannel.EMAIL,
      targetKey: input.recipient.email.trim().toLowerCase(),
      snapshot: {
        kind: 'email',
        template: input.template,
        locale,
        to: input.recipient.email.trim().toLowerCase(),
        url: input.url,
        params: input.params,
      },
    })
  }

  if (channels.push && input.recipient.userId) {
    const subscriptions = await tx.pushSubscription.findMany({
      where: { userId: input.recipient.userId },
    })
    if (subscriptions.length === 0) {
      console.warn(
        `[notifications] Push selected for ${input.recipient.userId}, but no push target exists`,
      )
    }

    for (const subscription of subscriptions) {
      deliveries.push({
        eventKey: input.eventKey,
        recipientKey: key,
        recipientUserId: input.recipient.userId,
        category: input.category,
        channel: NotificationDeliveryChannel.PUSH,
        targetKey: subscription.id,
        snapshot: {
          kind: 'push',
          locale,
          subscription: {
            id: subscription.id,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          payload: buildAccountPushPayload(
            input.category,
            Object.fromEntries(
              Object.entries(input.params).map(([param, value]) => [
                param,
                String(value),
              ]),
            ),
            input.url,
          ),
        },
      })
    }
  }

  return createDeliveries(tx, deliveries)
}

/** Plans all account + group-override deliveries for one persisted activity. */
export async function planGroupActivityNotifications(
  tx: Transaction,
  input: GroupActivityInput,
): Promise<number> {
  const category = activityTypeToNotificationCategory(input.activityType)
  if (!category) return 0

  const group = await tx.group.findUnique({
    where: { id: input.groupId },
    select: {
      name: true,
      memberships: {
        where: { archivedAt: null },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              email: true,
              emailVerified: true,
              locale: true,
              name: true,
            },
          },
          notificationOverrides: {
            where: { category },
            select: { email: true, push: true },
          },
        },
      },
    },
  })
  if (!group) return 0

  const actorName =
    group.memberships.find(
      (membership) => membership.userId === input.actorUserId,
    )?.user.name || 'Knots'
  const expenseTitle =
    input.expenseTitle ??
    (input.expenseId
      ? (
          await tx.expense.findUnique({
            where: { id: input.expenseId },
            select: { title: true },
          })
        )?.title
      : undefined)
  const deliveries: Parameters<typeof createDeliveries>[1] = []

  for (const membership of group.memberships) {
    if (input.actorUserId && membership.userId === input.actorUserId) continue

    const override = membership.notificationOverrides[0]
    const channels = await effectiveChannels(
      tx,
      membership.userId,
      category,
      override,
    )
    const key = `user:${membership.userId}`
    const locale = membership.user.locale || 'en-US'
    const url = `/groups/${input.groupId}/expenses`

    if (
      channels.email &&
      membership.user.emailVerified &&
      membership.user.email.trim()
    ) {
      deliveries.push({
        eventKey: input.eventKey,
        recipientKey: key,
        recipientUserId: membership.userId,
        category,
        channel: NotificationDeliveryChannel.EMAIL,
        targetKey: membership.user.email.trim().toLowerCase(),
        snapshot: {
          kind: 'email',
          template: 'group-activity',
          locale,
          to: membership.user.email.trim().toLowerCase(),
          url,
          params: {
            actorName,
            groupName: group.name,
            expenseTitle: expenseTitle || '',
            activityType: input.activityType,
          },
        },
      })
    }

    if (channels.push) {
      const subscriptions = await tx.pushSubscription.findMany({
        where: { userId: membership.userId },
      })
      if (subscriptions.length === 0) {
        console.warn(
          `[notifications] Push selected for ${membership.userId}, but no push target exists`,
        )
      }
      for (const subscription of subscriptions) {
        deliveries.push({
          eventKey: input.eventKey,
          recipientKey: key,
          recipientUserId: membership.userId,
          category,
          channel: NotificationDeliveryChannel.PUSH,
          targetKey: subscription.id,
          snapshot: {
            kind: 'push',
            locale,
            subscription: {
              id: subscription.id,
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
            payload: buildPushPayload(
              input.activityType,
              input.groupId,
              group.name,
              expenseTitle,
              actorName,
            ),
          },
        })
      }
    }
  }

  return createDeliveries(tx, deliveries)
}
