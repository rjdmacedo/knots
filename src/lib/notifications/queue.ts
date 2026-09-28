import type { PgBoss } from 'pg-boss'

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery'
export const NOTIFICATION_RECONCILE_QUEUE = 'notification-reconcile'
export const NOTIFICATION_CLEANUP_QUEUE = 'notification-cleanup'
export const RECURRING_EXPENSE_QUEUE = 'recurring-expense-materialize'
export const RECURRING_RECONCILE_QUEUE = 'recurring-expense-reconcile'

const QUEUES = [
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_RECONCILE_QUEUE,
  NOTIFICATION_CLEANUP_QUEUE,
  RECURRING_EXPENSE_QUEUE,
  RECURRING_RECONCILE_QUEUE,
] as const

declare global {
  // eslint-disable-next-line no-var
  var notificationBossPromise: Promise<PgBoss> | undefined
}

export async function getNotificationBoss(): Promise<PgBoss> {
  if (!globalThis.notificationBossPromise) {
    globalThis.notificationBossPromise = (async () => {
      const { PgBoss } = await import('pg-boss')
      const connectionString =
        process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL
      if (!connectionString) {
        throw new Error(
          'A PostgreSQL URL is required for the notification queue',
        )
      }

      const boss = new PgBoss({
        connectionString,
        application_name: 'knots-notifications',
      })
      boss.on('error', (error) => {
        console.error('[notifications:queue]', error)
      })
      await boss.start()
      await Promise.all(
        QUEUES.map((name) =>
          boss.createQueue(name).catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error)
            if (!message.toLowerCase().includes('already exists')) throw error
          }),
        ),
      )
      return boss
    })()
  }
  return globalThis.notificationBossPromise
}
