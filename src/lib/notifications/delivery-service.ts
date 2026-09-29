import { emailService } from '@/lib/auth/email-service'
import { env } from '@/lib/env'
import {
  isNotificationSnapshot,
  type NotificationEmailSnapshot,
  type NotificationPushSnapshot,
  type NotificationSnapshot,
} from '@/lib/notifications/types'
import { getAppBaseUrl } from '@/lib/passkey/config'
import { prisma } from '@/lib/prisma'
import { NotificationDeliveryStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import webpush, { WebPushError } from 'web-push'

const LEASE_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 5

export type DeliveryOutcome = 'sent' | 'skipped' | 'retry' | 'failed'

/** Mail clients turn a path-only href into `http:///path`, which Chrome blocks. */
function absoluteAppUrl(url: string): string {
  const normalized = url.trim().replace(/^https?:\/\/\/+/i, '/')
  return new URL(normalized, getAppBaseUrl()).href
}

async function sendEmail(snapshot: NotificationEmailSnapshot) {
  const stringParam = (name: string) => String(snapshot.params[name] ?? '')
  const url = absoluteAppUrl(snapshot.url)

  switch (snapshot.template) {
    case 'group-invitation':
      return emailService.sendInvitationEmail(
        snapshot.to,
        stringParam('groupName'),
        url,
      )
    case 'added-to-group':
      return emailService.sendAddedToGroupEmail(
        snapshot.to,
        stringParam('groupName'),
        url,
      )
    case 'friend-invite':
      return emailService.sendFriendInviteEmail(
        snapshot.to,
        stringParam('inviterName'),
        url,
        snapshot.params.hasAccount === true,
      )
    case 'group-activity':
      return emailService.sendGroupActivityDigestEmail(
        snapshot.to,
        stringParam('actorName'),
        stringParam('groupName'),
        url,
        stringParam('expenseTitle'),
        stringParam('activityType'),
      )
  }
}

async function sendPush(snapshot: NotificationPushSnapshot): Promise<void> {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error('Web Push is not configured')
  }

  const subject = env.NEXT_PUBLIC_BASE_URL.startsWith('https://')
    ? env.NEXT_PUBLIC_BASE_URL
    : 'mailto:dev@localhost'
  webpush.setVapidDetails(subject, publicKey, privateKey)
  await webpush.sendNotification(
    {
      endpoint: snapshot.subscription.endpoint,
      keys: {
        p256dh: snapshot.subscription.p256dh,
        auth: snapshot.subscription.auth,
      },
    },
    JSON.stringify(snapshot.payload),
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function processNotificationDelivery(
  deliveryId: string,
): Promise<DeliveryOutcome> {
  const leaseToken = randomUUID()
  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS)

  const claimed = await prisma.notificationDelivery.updateMany({
    where: {
      id: deliveryId,
      availableAt: { lte: now },
      OR: [
        { status: NotificationDeliveryStatus.PENDING },
        {
          status: NotificationDeliveryStatus.PROCESSING,
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    data: {
      status: NotificationDeliveryStatus.PROCESSING,
      leaseToken,
      leaseExpiresAt,
      attempts: { increment: 1 },
      lastError: null,
    },
  })
  if (claimed.count === 0) return 'skipped'

  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: deliveryId },
  })
  if (!delivery || !isNotificationSnapshot(delivery.snapshot)) {
    await prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, leaseToken },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        terminalAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: 'Invalid notification snapshot',
      },
    })
    return 'failed'
  }
  const snapshot = delivery.snapshot as unknown as NotificationSnapshot

  try {
    if (snapshot.kind === 'email') {
      const result = await sendEmail(snapshot)
      if (!result.ok) throw new Error(result.error)
    } else {
      await sendPush(snapshot)
    }

    await prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, leaseToken },
      data: {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        terminalAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    })
    return 'sent'
  } catch (error) {
    const stalePush =
      snapshot.kind === 'push' &&
      error instanceof WebPushError &&
      (error.statusCode === 404 || error.statusCode === 410)

    if (stalePush && snapshot.kind === 'push') {
      await prisma.pushSubscription.deleteMany({
        where: { id: snapshot.subscription.id },
      })
    }

    const terminal = stalePush || delivery.attempts >= MAX_ATTEMPTS
    const retryDelaySeconds = Math.min(
      15 * 2 ** Math.max(0, delivery.attempts - 1),
      15 * 60,
    )
    await prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, leaseToken },
      data: {
        status: terminal
          ? NotificationDeliveryStatus.FAILED
          : NotificationDeliveryStatus.PENDING,
        availableAt: terminal
          ? delivery.availableAt
          : new Date(Date.now() + retryDelaySeconds * 1000),
        terminalAt: terminal ? new Date() : null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: errorMessage(error),
      },
    })
    return terminal ? 'failed' : 'retry'
  }
}

export async function findDeliveriesNeedingJobs(
  limit = 100,
): Promise<string[]> {
  const now = new Date()
  await prisma.notificationDelivery.updateMany({
    where: {
      status: NotificationDeliveryStatus.PROCESSING,
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: NotificationDeliveryStatus.PENDING,
      leaseToken: null,
      leaseExpiresAt: null,
      availableAt: now,
      lastError: 'Recovered expired delivery lease',
    },
  })

  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      status: NotificationDeliveryStatus.PENDING,
      availableAt: { lte: now },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  return deliveries.map(({ id }) => id)
}

export async function cleanupNotificationDeliveries(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.notificationDelivery.deleteMany({
    where: {
      status: {
        in: [
          NotificationDeliveryStatus.SENT,
          NotificationDeliveryStatus.FAILED,
        ],
      },
      terminalAt: { lt: cutoff },
    },
  })
  return result.count
}
