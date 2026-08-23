'use client'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'
import { Bell, BellOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { NotificationSettingsPopover } from './notification-settings-popover'

interface GroupNotificationToggleProps {
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}

export function GroupNotificationToggle({
  groupId,
  members,
  currentUserId,
}: GroupNotificationToggleProps) {
  const t = useTranslations('Notifications')
  const panelId = useId()

  // Load email preference to derive icon state
  const { data: prefsData } =
    trpc.groupMembership.getNotificationPreferences.useQuery(
      { groupId },
      { enabled: !!currentUserId },
    )

  // Derive push channel state
  const { isSubscribed: pushEnabled } = usePushNotificationSubscription(
    groupId,
    currentUserId,
  )

  const emailEnabled = prefsData?.emailNotificationsEnabled ?? false
  const anyChannelEnabled = pushEnabled || emailEnabled

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-controls={panelId}
                />
              }
            />
          }
        >
          {anyChannelEnabled ? (
            <Bell className="size-4" />
          ) : (
            <BellOff className="size-4" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          <p>{anyChannelEnabled ? t('unsubscribe') : t('subscribe')}</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        id={panelId}
        align="end"
        className="w-80 p-0"
        initialFocus={false}
      >
        <NotificationSettingsPopover
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
        />
      </PopoverContent>
    </Popover>
  )
}
