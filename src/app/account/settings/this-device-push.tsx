'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'
import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SettingsGroup, SettingsRow } from './settings-ui'

/**
 * This browser's push subscription. One row covers every group; the server
 * decides what to deliver from account and membership preferences.
 */
export function ThisDevicePush() {
  const t = useTranslations('ProfileSettings')
  const push = usePushNotificationSubscription()
  const prefs = trpc.profile.notificationPreferences.useQuery()
  const accountWantsPush =
    !!prefs.data?.notificationsEnabled &&
    Object.values(prefs.data.categories).some((channels) => channels.push)
  const showPushSelectedWarning =
    accountWantsPush && !push.isLoading && !push.isSubscribed

  const unavailableReason = push.iosHomeScreenRequired
    ? 'iosInstall'
    : !push.isSupported
      ? 'unsupported'
      : !push.configured && !push.isLoading
        ? 'unconfigured'
        : push.permission === 'denied'
          ? 'denied'
          : null

  async function handleToggle(action: 'subscribe' | 'unsubscribe') {
    const errorCode =
      action === 'subscribe' ? await push.subscribe() : await push.unsubscribe()
    if (!errorCode) return

    toast.error(
      errorCode === 'permissionDenied'
        ? t('notifications.pushDisabled.denied')
        : t('notifications.thisDevice.error'),
    )
  }

  return (
    <SettingsGroup title={t('notifications.thisDevice.title')}>
      {showPushSelectedWarning ? (
        <div className="px-4 pt-4 sm:px-6">
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              {t('notifications.thisDevice.pushSelectedWarning')}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <SettingsRow
        label={
          <DeviceLabel unavailableReason={unavailableReason} push={push} />
        }
        control={
          unavailableReason || push.isLoading ? null : push.isSubscribed ? (
            <Button
              type="button"
              variant="destructive"
              disabled={push.isUpdating}
              onClick={() => void handleToggle('unsubscribe')}
            >
              {t('notifications.thisDevice.disable')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={push.isUpdating}
              onClick={() => void handleToggle('subscribe')}
            >
              {t('notifications.thisDevice.enable')}
            </Button>
          )
        }
        description={
          <>
            {t('notifications.thisDevice.description')}
            {push.iosHomeScreenRequired
              ? ` ${t('notifications.pushDisabled.iosInstall')}`
              : null}
          </>
        }
      />
    </SettingsGroup>
  )
}

function DeviceLabel({
  unavailableReason,
  push,
}: {
  unavailableReason:
    | 'iosInstall'
    | 'unsupported'
    | 'unconfigured'
    | 'denied'
    | null
  push: ReturnType<typeof usePushNotificationSubscription>
}) {
  const t = useTranslations('ProfileSettings')

  if (push.isLoading) {
    return (
      <span className="text-muted-foreground">
        {t('notifications.thisDevice.checking')}
      </span>
    )
  }

  if (unavailableReason === 'iosInstall') {
    return <span>{t('notifications.thisDevice.disabledLabel')}</span>
  }

  if (unavailableReason) {
    return (
      <span className="text-muted-foreground">
        {t(`notifications.pushDisabled.${unavailableReason}`)}
      </span>
    )
  }

  return (
    <span>
      {push.isSubscribed
        ? t('notifications.thisDevice.enabledLabel')
        : t('notifications.thisDevice.disabledLabel')}
    </span>
  )
}
