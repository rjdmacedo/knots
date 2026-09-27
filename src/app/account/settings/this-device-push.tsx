'use client'

import { Button } from '@/components/ui/button'
import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { useTranslations } from 'next-intl'
import { SettingsGroup, SettingsRow } from './settings-ui'

/**
 * This browser's push subscription. One row covers every group; the server
 * decides what to deliver from account and membership preferences.
 */
export function ThisDevicePush() {
  const t = useTranslations('ProfileSettings')
  const push = usePushNotificationSubscription()

  const unavailableReason = push.iosHomeScreenRequired
    ? 'iosInstall'
    : !push.isSupported
      ? 'unsupported'
      : !push.configured && !push.isLoading
        ? 'unconfigured'
        : push.permission === 'denied'
          ? 'denied'
          : null

  return (
    <SettingsGroup title={t('notifications.thisDevice.title')}>
      <SettingsRow
        label={
          <DeviceLabel unavailableReason={unavailableReason} push={push} />
        }
        control={
          unavailableReason || push.isLoading ? null : push.isSubscribed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={push.isUpdating}
              onClick={() => void push.unsubscribe()}
            >
              {t('notifications.thisDevice.disable')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={push.isUpdating}
              onClick={() => void push.subscribe()}
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
