'use client'

import { isIosNeedsInstall } from '@/lib/push/push-availability'
import {
  getOrCreatePushSubscription,
  isPushSupported,
  registerServiceWorker,
} from '@/lib/push/register-sw'
import { trpc } from '@/trpc/client'
import { useCallback, useEffect, useState } from 'react'

export { isPushSupported }

export type PushNotificationErrorCode = 'permissionDenied' | 'subscribeError'

type PushSubscriptionJSON = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

function serializePushSubscription(
  subscription: PushSubscription,
): PushSubscriptionJSON {
  const keys = subscription.toJSON().keys
  if (!keys?.p256dh || !keys.auth) {
    throw new Error('Push subscription is missing encryption keys')
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  }
}

/**
 * Drop this browser's server row and local subscription. Logout must still
 * finish when the browser has already discarded the endpoint.
 */
export async function disconnectPushSubscription(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    await fetch('/api/trpc/pushSubscriptions.remove?batch=1', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        0: { json: { endpoint: subscription.endpoint } },
      }),
    }).catch(() => undefined)
    await subscription.unsubscribe().catch(() => undefined)
  } catch {
    // Logout continues either way.
  }
}

/**
 * The browser's push subscription. `groupId` is ignored: one subscription
 * covers every group, and the server decides delivery.
 */
export function usePushNotificationSubscription(
  _groupId?: string,
  _currentUserId?: string,
) {
  const utils = trpc.useUtils()
  const [supported, setSupported] = useState(false)
  const [iosHomeScreenRequired, setIosHomeScreenRequired] = useState(false)
  const [detected, setDetected] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  )
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false)
  const [error, setError] = useState<PushNotificationErrorCode | null>(null)

  const config = trpc.pushSubscriptions.getConfig.useQuery(undefined, {
    enabled: supported,
    staleTime: Infinity,
  })
  const register = trpc.pushSubscriptions.register.useMutation()
  const remove = trpc.pushSubscriptions.remove.useMutation()
  const status = trpc.pushSubscriptions.status.useQuery(
    { endpoint: subscription?.endpoint ?? 'https://invalid.local/disabled' },
    {
      enabled: supported && !!subscription,
      staleTime: 30_000,
      retry: false,
    },
  )

  const refreshSubscription = useCallback(async () => {
    if (!supported) return
    setIsLoadingSubscription(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const value = (await registration?.pushManager.getSubscription()) ?? null
      setSubscription(value)
    } catch {
      setError('subscribeError')
    } finally {
      setIsLoadingSubscription(false)
    }
  }, [supported])

  useEffect(() => {
    setSupported(isPushSupported())
    setIosHomeScreenRequired(isIosNeedsInstall())
    setDetected(true)
  }, [])

  useEffect(() => {
    if (!supported) return
    void refreshSubscription()
  }, [refreshSubscription, supported])

  useEffect(() => {
    if (!subscription || status.data?.subscribed !== false || status.isFetching)
      return
    let active = true
    void subscription
      .unsubscribe()
      .catch(() => undefined)
      .finally(() => {
        if (active) setSubscription(null)
      })
    return () => {
      active = false
    }
  }, [status.data?.subscribed, status.isFetching, subscription])

  const enable =
    useCallback(async (): Promise<PushNotificationErrorCode | null> => {
      setError(null)
      if (!config.data?.vapidPublicKey) {
        setError('subscribeError')
        return 'subscribeError'
      }

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

        const next = await getOrCreatePushSubscription(
          registration,
          config.data.vapidPublicKey,
        )
        if (!next) {
          setError('subscribeError')
          return 'subscribeError'
        }

        await register.mutateAsync({
          ...serializePushSubscription(next),
          userAgent: navigator.userAgent,
        })
        setSubscription(next)
        await utils.pushSubscriptions.status.invalidate({
          endpoint: next.endpoint,
        })
        return null
      } catch (err) {
        console.error('[push] Subscribe failed:', err)
        setError('subscribeError')
        return 'subscribeError'
      }
    }, [config.data?.vapidPublicKey, register, utils])

  const disable =
    useCallback(async (): Promise<PushNotificationErrorCode | null> => {
      setError(null)
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        const current =
          subscription ??
          (await registration?.pushManager.getSubscription()) ??
          null
        if (current) {
          await remove.mutateAsync({ endpoint: current.endpoint })
          await current.unsubscribe()
        }
        setSubscription(null)
        return null
      } catch (err) {
        console.error('[push] Unsubscribe failed:', err)
        setError('subscribeError')
        return 'subscribeError'
      }
    }, [remove, subscription])

  const toggle =
    useCallback(async (): Promise<PushNotificationErrorCode | null> => {
      if (subscription && (status.data?.subscribed ?? true)) {
        return disable()
      }
      return enable()
    }, [disable, enable, status.data?.subscribed, subscription])

  const enabled = !!subscription && (status.data?.subscribed ?? true)

  return {
    isSupported: supported,
    configured: config.data?.configured ?? false,
    iosHomeScreenRequired,
    permission: supported ? Notification.permission : 'unsupported',
    isSubscribed: enabled,
    isLoading:
      !detected ||
      (supported &&
        (isLoadingSubscription ||
          config.isLoading ||
          (!!subscription && status.isLoading))),
    isUpdating: register.isPending || remove.isPending,
    error,
    subscribe: enable,
    unsubscribe: disable,
    toggle,
    clearError: () => setError(null),
    disconnect: disconnectPushSubscription,
  }
}
