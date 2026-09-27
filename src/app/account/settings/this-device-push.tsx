'use client'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import {
  detectPushDisabledReason,
  type PushDisabledReason,
} from '@/lib/push/push-availability'
import {
  getOrCreatePushSubscription,
  registerServiceWorker,
} from '@/lib/push/register-sw'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import * as React from 'react'
import { SettingsGroup, SettingsRow } from './settings-ui'

/**
 * This device group (task 7.4, requirement 10).
 *
 * A user-scoped push subscription: a `PushSubscription` row with `groupId:
 * null` means "this browser, all groups". Enabling registers that null-group
 * row and the browser `PushSubscription`; disabling removes only this browser's
 * null-group row (requirement 10.5).
 *
 * The group is always rendered — even when the master switch is off — because
 * `NotificationsPreferences` places it in its `deviceSlot` outside the master
 * conditional (requirement 10.1).
 */

interface ThisDevicePushProps {
  /** The current user id, used as `subscriberUserId` on the null-group row. */
  currentUserId: string
}

type DeviceState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: Exclude<PushDisabledReason, null> }
  | { kind: 'enabled' }
  | { kind: 'disabled' }

export function ThisDevicePush({ currentUserId }: ThisDevicePushProps) {
  const t = useTranslations('ProfileSettings')
  const utils = trpc.useUtils()

  const createDevice = trpc.pushSubscriptions.createDevice.useMutation()
  const deleteDevice = trpc.pushSubscriptions.deleteDevice.useMutation()

  const [state, setState] = React.useState<DeviceState>({ kind: 'loading' })
  const [busy, setBusy] = React.useState(false)

  // Detect availability and current subscription state once on mount.
  React.useEffect(() => {
    let cancelled = false

    const reason = detectPushDisabledReason()
    if (reason !== null) {
      setState({ kind: 'unavailable', reason })
      return
    }

    registerServiceWorker()
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) => {
        if (cancelled) return
        if (!subscription) {
          setState({ kind: 'disabled' })
          return
        }

        try {
          const rows = await utils.client.pushSubscriptions.list.query({
            endpoint: subscription.endpoint,
          })
          if (cancelled) return
          const hasDeviceRow = rows.some((row) => row.groupId === null)
          setState({ kind: hasDeviceRow ? 'enabled' : 'disabled' })
        } catch {
          if (!cancelled) setState({ kind: 'disabled' })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'disabled' })
      })

    return () => {
      cancelled = true
    }
  }, [utils])

  async function handleEnable() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState({ kind: 'unavailable', reason: 'denied' })
        return
      }

      const registration = await registerServiceWorker()
      if (!registration) {
        toast.error(t('notifications.thisDevice.error'))
        return
      }

      const subscription = await getOrCreatePushSubscription(
        registration,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      )
      if (!subscription) {
        toast.error(t('notifications.thisDevice.error'))
        return
      }

      const json = subscription.toJSON()
      await createDevice.mutateAsync({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? '',
          auth: json.keys?.auth ?? '',
        },
        subscriberUserId: currentUserId,
      })
      setState({ kind: 'enabled' })
    } catch (err) {
      console.error('[push] Enable this device failed:', err)
      toast.error(t('notifications.thisDevice.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      const registration = await registerServiceWorker()
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription) {
        await deleteDevice.mutateAsync({ endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setState({ kind: 'disabled' })
    } catch (err) {
      console.error('[push] Disable this device failed:', err)
      toast.error(t('notifications.thisDevice.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsGroup title={t('notifications.thisDevice.title')}>
      <SettingsRow
        label={<DeviceLabel state={state} />}
        control={
          <DeviceControl
            state={state}
            busy={busy}
            onEnable={handleEnable}
            onDisable={handleDisable}
          />
        }
        description={
          <>
            {t('notifications.thisDevice.description')}{' '}
            {t('notifications.pushDisabled.iosInstall')}
          </>
        }
      />
    </SettingsGroup>
  )
}

function DeviceLabel({ state }: { state: DeviceState }) {
  const t = useTranslations('ProfileSettings')

  switch (state.kind) {
    case 'loading':
      return (
        <span className="text-muted-foreground">
          {t('notifications.thisDevice.checking')}
        </span>
      )
    case 'enabled':
      return <span>{t('notifications.thisDevice.enabledLabel')}</span>
    case 'disabled':
      return <span>{t('notifications.thisDevice.disabledLabel')}</span>
    case 'unavailable':
      if (state.reason === 'iosInstall') {
        return <span>{t('notifications.thisDevice.disabledLabel')}</span>
      }
      return (
        <span className="text-muted-foreground">
          {t(`notifications.pushDisabled.${state.reason}`)}
        </span>
      )
  }
}

interface DeviceControlProps {
  state: DeviceState
  busy: boolean
  onEnable: () => void
  onDisable: () => void
}

function DeviceControl({
  state,
  busy,
  onEnable,
  onDisable,
}: DeviceControlProps) {
  const t = useTranslations('ProfileSettings')

  // Requirement 10.4: no enable button in any unavailable state (or loading).
  if (state.kind === 'loading' || state.kind === 'unavailable') {
    return null
  }

  if (state.kind === 'enabled') {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onDisable}
        size="sm"
      >
        {t('notifications.thisDevice.disable')}
      </Button>
    )
  }

  return (
    <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
      {t('notifications.thisDevice.enable')}
    </Button>
  )
}
