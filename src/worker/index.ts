import { materializeRecurringExpenses } from '@/lib/api'
import {
  cleanupNotificationDeliveries,
  findDeliveriesNeedingJobs,
  processNotificationDelivery,
} from '@/lib/notifications/delivery-service'
import {
  getNotificationBoss,
  NOTIFICATION_CLEANUP_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_RECONCILE_QUEUE,
  RECURRING_EXPENSE_QUEUE,
  RECURRING_RECONCILE_QUEUE,
} from '@/lib/notifications/queue'
import { prisma } from '@/lib/prisma'
import { rm, writeFile } from 'node:fs/promises'

type DeliveryJob = { deliveryId: string }
type RecurringJob = { recurringLinkId: string }

async function reconcileDeliveries(): Promise<number> {
  const boss = await getNotificationBoss()
  const ids = await findDeliveriesNeedingJobs()
  await Promise.all(
    ids.map((deliveryId) =>
      boss.send(
        NOTIFICATION_DELIVERY_QUEUE,
        { deliveryId },
        {
          singletonKey: deliveryId,
          expireInSeconds: 3 * 60,
        },
      ),
    ),
  )
  return ids.length
}

async function reconcileRecurringExpenses(): Promise<number> {
  const now = new Date()
  const links = await prisma.recurringExpenseLink.findMany({
    where: {
      nextExpenseCreatedAt: null,
      nextExpenseDate: { lte: now },
    },
    select: { id: true, nextExpenseDate: true },
    orderBy: { nextExpenseDate: 'asc' },
    take: 100,
  })
  const boss = await getNotificationBoss()
  await Promise.all(
    links.map((link) =>
      boss.send(
        RECURRING_EXPENSE_QUEUE,
        { recurringLinkId: link.id },
        {
          singletonKey: `${link.id}:${link.nextExpenseDate.toISOString()}`,
          expireInSeconds: 10 * 60,
        },
      ),
    ),
  )
  return links.length
}

async function main(): Promise<void> {
  await rm('/tmp/knots-worker-ready', { force: true })
  const boss = await getNotificationBoss()

  await boss.work<DeliveryJob>(
    NOTIFICATION_DELIVERY_QUEUE,
    { batchSize: 10, pollingIntervalSeconds: 2 },
    async (jobs) => {
      await Promise.all(
        jobs.map((job) => processNotificationDelivery(job.data.deliveryId)),
      )
    },
  )
  await boss.work(
    NOTIFICATION_RECONCILE_QUEUE,
    { pollingIntervalSeconds: 2 },
    async () => {
      await reconcileDeliveries()
    },
  )
  await boss.work<RecurringJob>(
    RECURRING_EXPENSE_QUEUE,
    { batchSize: 5 },
    async (jobs) => {
      for (const job of jobs) {
        await materializeRecurringExpenses(new Date(), job.data.recurringLinkId)
      }
    },
  )
  await boss.work(RECURRING_RECONCILE_QUEUE, async () => {
    await reconcileRecurringExpenses()
  })
  await boss.work(NOTIFICATION_CLEANUP_QUEUE, async () => {
    await cleanupNotificationDeliveries()
  })

  await boss.schedule(NOTIFICATION_RECONCILE_QUEUE, '*/1 * * * *')
  await boss.schedule(RECURRING_RECONCILE_QUEUE, '*/1 * * * *')
  await boss.schedule(NOTIFICATION_CLEANUP_QUEUE, '17 3 * * *')

  await reconcileRecurringExpenses()
  await reconcileDeliveries()
  let deliveryReconcileRunning = false
  const deliveryTimer = setInterval(() => {
    if (deliveryReconcileRunning) return
    deliveryReconcileRunning = true
    void reconcileDeliveries().finally(() => {
      deliveryReconcileRunning = false
    })
  }, 5_000)
  await writeFile('/tmp/knots-worker-ready', new Date().toISOString())
  console.log('[worker] Notification worker ready')

  const shutdown = async () => {
    console.log('[worker] Shutting down')
    clearInterval(deliveryTimer)
    await rm('/tmp/knots-worker-ready', { force: true })
    await boss.stop({ graceful: true, timeout: 30_000 })
    await prisma.$disconnect()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

main().catch((error) => {
  console.error('[worker] Fatal error:', error)
  process.exit(1)
})
