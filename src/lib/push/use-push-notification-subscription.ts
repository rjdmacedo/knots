'use client'

import {
  getOrCreatePushSubscription,
  registerServiceWorker,
} from '@/lib/push/register-sw'
import {
  defaultPushPreferences,
  type PushSubscriptionPreferences,
} from '@/lib/push/subscription-filters'
import { trpc } from '@/trpc/client'
import { useCallback, useEffect, useState } from 'react'

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export type PushNotificationErrorCode = 'permissionDenied' | 'subscribeError'

export function usePushNotificationSubscription(
  groupId: string,
  currentUserId: string | undefined,
) {
  const utils = trpc.useUtils()
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [preferences, setPreferences] =
    useState<PushSubscriptionPreferences | null>(null)
  const [error, setError] = useState<PushNotificationErrorCode | null>(null)

  const createMutation = trpc.pushSubscriptions.create.useMutation()
  const deleteMutation = trpc.pushSubscriptions.delete.useMutation()

  useEffect(() => {
    let cancelled = false

    const supported = isPushSupported()
    setIsSupported(supported)

    if (!supported) return

    registerServiceWorker()
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) => {
        if (cancelled || !subscription) return

        try {
          const subscriptions = await utils.client.pushSubscriptions.list.query(
            {
              endpoint: subscription.endpoint,
            },
          )
          const groupSub = subscriptions.find((s) => s.groupId === groupId)
          if (groupSub) {
            setIsSubscribed(true)
            setPreferences({
              subscriberUserId: groupSub.subscriberUserId,
              notifyAllMembers: groupSub.notifyAllMembers,
              includedUserIds: groupSub.includedUserIds,
              notifyOnCreate: groupSub.notifyOnCreate,
              notifyOnUpdate: groupSub.notifyOnUpdate,
              notifyOnDelete: groupSub.notifyOnDelete,
            })
          }
        } catch {
          // Status check is best-effort
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [groupId, utils])

  const persistSubscription = useCallback(
    async (
      subscription: PushSubscription,
      prefs: PushSubscriptionPreferences,
    ): Promise<void> => {
      const json = subscription.toJSON()
      await createMutation.mutateAsync({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        groupId,
        preferences: prefs,
      })
      setIsSubscribed(true)
      setPreferences(prefs)
    },
    [groupId, createMutation],
  )

  const subscribe = useCallback(
    async (
      prefs?: PushSubscriptionPreferences,
    ): Promise<PushNotificationErrorCode | null> => {
      if (!currentUserId) {
        setError('subscribeError')
        return 'subscribeError'
      }

      setIsLoading(true)
      setError(null)

      const resolved =
        prefs ?? preferences ?? defaultPushPreferences(currentUserId)

      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setError('permissionDenied')
          return 'permissionDenied'
        }

        const registration = await registerServiceWorker()
        if (!registration) {
          setError('subscribeError')
          return 'subscribeError'
        }

        const subscription = await getOrCreatePushSubscription(
          registration,
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        )
        if (!subscription) {
          setError('subscribeError')
          return 'subscribeError'
        }

        await persistSubscription(subscription, {
          ...resolved,
          subscriberUserId: currentUserId,
        })
        return null
      } catch (err) {
        console.error('[push] Subscribe failed:', err)
        setError('subscribeError')
        return 'subscribeError'
      } finally {
        setIsLoading(false)
      }
    },
    [currentUserId, preferences, persistSubscription],
  )

  const unsubscribe =
    useCallback(async (): Promise<PushNotificationErrorCode | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const registration = await registerServiceWorker()
        const subscription = await registration?.pushManager.getSubscription()

        if (subscription) {
          await deleteMutation.mutateAsync({
            endpoint: subscription.endpoint,
            groupId,
          })
          await subscription.unsubscribe()
        }

        setIsSubscribed(false)
        setPreferences(null)
        return null
      } catch (err) {
        console.error('[push] Unsubscribe failed:', err)
        setError('subscribeError')
        return 'subscribeError'
      } finally {
        setIsLoading(false)
      }
    }, [groupId, deleteMutation])

  const toggle =
    useCallback(async (): Promise<PushNotificationErrorCode | null> => {
      if (isSubscribed) {
        return unsubscribe()
      }
      return subscribe()
    }, [isSubscribed, subscribe, unsubscribe])

  const updatePreferences = useCallback(
    async (
      prefs: PushSubscriptionPreferences,
    ): Promise<PushNotificationErrorCode | null> => {
      if (!isSubscribed || !currentUserId) return null

      setIsLoading(true)
      setError(null)

      try {
        const registration = await registerServiceWorker()
        const subscription = await registration?.pushManager.getSubscription()

        if (!subscription) {
          setError('subscribeError')
          return 'subscribeError'
        }

        await persistSubscription(subscription, {
          ...prefs,
          subscriberUserId: currentUserId,
        })
        return null
      } catch (err) {
        console.error('[push] Update preferences failed:', err)
        setError('subscribeError')
        return 'subscribeError'
      } finally {
        setIsLoading(false)
      }
    },
    [isSubscribed, currentUserId, persistSubscription],
  )

  return {
    isSupported,
    isSubscribed,
    isLoading,
    preferences,
    error,
    subscribe,
    unsubscribe,
    toggle,
    updatePreferences,
    clearError: () => setError(null),
  }
}
