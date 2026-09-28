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
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { NotificationSettingsPopover } from './notification-settings-popover'

interface GroupNotificationToggleProps {
  groupId: string
  currentUserId: string | undefined
  emailVerified?: boolean
}

export function GroupNotificationToggle({
  groupId,
  currentUserId,
  emailVerified = false,
}: GroupNotificationToggleProps) {
  const t = useTranslations('Notifications')
  const panelId = useId()

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
                  aria-label={t('settings')}
                  aria-controls={panelId}
                />
              }
            />
          }
        >
          <Bell className="size-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('settings')}</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        id={panelId}
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        initialFocus={false}
      >
        <NotificationSettingsPopover
          groupId={groupId}
          currentUserId={currentUserId}
          emailVerified={emailVerified}
        />
      </PopoverContent>
    </Popover>
  )
}
