'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { registerServiceWorker } from '@/lib/push/register-sw'
import { trpc } from '@/trpc/client'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

interface PushNotificationToggleProps {
  groupId: string
  participants: Array<{ id: string; name: string }>
}

function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function PushNotificationToggle({
  groupId,
  participants,
}: PushNotificationToggleProps) {
  const t = useTranslations('Notifications')
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [participantName, setParticipantName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const checkedRef = useRef(false)

  const createMutation = trpc.pushSubscriptions.create.useMutation()
  const deleteMutation = trpc.pushSubscriptions.delete.useMutation()

  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true

    const supported = isPushSupported()
    setIsSupported(supported)

    if (supported) {
      registerServiceWorker()
        .then((registration) => registration?.pushManager.getSubscription())
        .then(async (subscription) => {
          if (!subscription) return

          const res = await fetch(
            `/api/trpc/pushSubscriptions.list?batch=1&input=${encodeURIComponent(
              JSON.stringify({
                '0': { json: { endpoint: subscription.endpoint } },
              }),
            )}`,
          )
          if (!res.ok) return

          const json = (await res.json()) as Array<{
            result?: {
              data?: {
                json?: Array<{
                  groupId: string
                  participantName: string | null
                }>
              }
            }
          }>
          const subscriptions = json?.[0]?.result?.data?.json
          if (Array.isArray(subscriptions)) {
            const groupSub = subscriptions.find(
              (s: { groupId: string; participantName: string | null }) =>
                s.groupId === groupId,
            )
            if (groupSub) {
              setIsSubscribed(true)
              setParticipantName(groupSub.participantName ?? null)
            }
          }
        })
        .catch(() => {
          // Silently handle errors during status check
        })
    }
  }, [groupId])

  const subscribe = useCallback(
    async (selectedParticipant?: string) => {
      setIsLoading(true)
      setError(null)

      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setError(t('permissionDenied'))
          setIsLoading(false)
          return
        }

        const registration = await registerServiceWorker()
        if (!registration) {
          setError(t('error'))
          setIsLoading(false)
          return
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        const json = subscription.toJSON()
        await createMutation.mutateAsync({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
          groupId,
          participantName: selectedParticipant ?? undefined,
        })

        setIsSubscribed(true)
        setParticipantName(selectedParticipant ?? null)
      } catch {
        setError(t('error'))
      } finally {
        setIsLoading(false)
      }
    },
    [groupId, createMutation, t],
  )

  const unsubscribe = useCallback(async () => {
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
      setParticipantName(null)
    } catch {
      setError(t('error'))
    } finally {
      setIsLoading(false)
    }
  }, [groupId, deleteMutation, t])

  const handleToggleNotifications = useCallback(
    async (checked: boolean) => {
      if (checked) {
        await subscribe(participantName ?? undefined)
      } else {
        await unsubscribe()
      }
    },
    [subscribe, unsubscribe, participantName],
  )

  const handleParticipantChange = useCallback(
    async (name: string) => {
      if (!isSubscribed) return

      const newValue = participantName === name ? null : name
      setIsLoading(true)
      setError(null)

      try {
        const registration = await registerServiceWorker()
        const subscription = await registration?.pushManager.getSubscription()

        if (subscription) {
          const json = subscription.toJSON()
          await createMutation.mutateAsync({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: json.keys?.p256dh ?? '',
              auth: json.keys?.auth ?? '',
            },
            groupId,
            participantName: newValue ?? undefined,
          })
        }

        setParticipantName(newValue)
      } catch {
        setError(t('error'))
      } finally {
        setIsLoading(false)
      }
    },
    [isSubscribed, participantName, groupId, createMutation, t],
  )

  if (!isSupported) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={isLoading}
          title={isSubscribed ? t('unsubscribe') : t('subscribe')}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSubscribed ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('subscribe')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={isSubscribed}
          onCheckedChange={handleToggleNotifications}
          disabled={isLoading}
        >
          {isSubscribed ? t('unsubscribe') : t('subscribe')}
        </DropdownMenuCheckboxItem>

        {isSubscribed && participants.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('selectParticipant')}</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={participantName === null}
              onCheckedChange={() => handleParticipantChange('__none__')}
              disabled={isLoading}
            >
              {t('noParticipant')}
            </DropdownMenuCheckboxItem>
            {participants.map((p) => (
              <DropdownMenuCheckboxItem
                key={p.id}
                checked={participantName === p.name}
                onCheckedChange={() => handleParticipantChange(p.name)}
                disabled={isLoading}
              >
                {p.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        {error && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-sm text-destructive">{error}</p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
