import type { PushNotificationPayload } from '@/lib/push/build-payload'

export type NotificationEmailTemplate =
  | 'group-invitation'
  | 'added-to-group'
  | 'friend-invite'
  | 'group-activity'

export type NotificationEmailSnapshot = {
  kind: 'email'
  template: NotificationEmailTemplate
  locale: string
  to: string
  url: string
  params: Record<string, string | boolean>
}

export type NotificationPushSnapshot = {
  kind: 'push'
  locale: string
  subscription: {
    id: string
    endpoint: string
    p256dh: string
    auth: string
  }
  payload: PushNotificationPayload
}

export type NotificationSnapshot =
  | NotificationEmailSnapshot
  | NotificationPushSnapshot

export function isNotificationSnapshot(
  value: unknown,
): value is NotificationSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as { kind?: unknown }
  return snapshot.kind === 'email' || snapshot.kind === 'push'
}
