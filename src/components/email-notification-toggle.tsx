'use client'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { trpc } from '@/trpc/client'
import { Loader2, Mail, MailX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import { toast } from 'sonner'

interface EmailNotificationToggleProps {
  groupId: string
}

export function EmailNotificationToggle({
  groupId,
}: EmailNotificationToggleProps) {
  const t = useTranslations('Notifications')
  const utils = trpc.useUtils()

  const { data, isLoading } =
    trpc.groupMembership.getEmailNotifications.useQuery({ groupId })

  const setMutation = trpc.groupMembership.setEmailNotifications.useMutation({
    onSuccess: (result) => {
      utils.groupMembership.getEmailNotifications.setData({ groupId }, result)
      toast.success(
        result.emailNotificationsEnabled
          ? t('emailEnabledToast')
          : t('emailDisabledToast'),
      )
    },
    onError: () => {
      toast.error(t('emailToggleError'))
    },
  })

  const enabled = data?.emailNotificationsEnabled ?? false
  const busy = isLoading || setMutation.isPending

  const toggle = useCallback(() => {
    if (busy) return
    setMutation.mutate({ groupId, enabled: !enabled })
  }, [busy, enabled, groupId, setMutation])

  const label = enabled
    ? t('disableEmailNotifications')
    : t('enableEmailNotifications')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={label}
            aria-pressed={enabled}
            disabled={busy}
            onClick={toggle}
          />
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : enabled ? (
          <Mail className="h-4 w-4" />
        ) : (
          <MailX className="h-4 w-4" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
