'use client'

import {
  EXPENSE_NOTIFICATION_CATEGORY_IDS,
  type ExpenseNotificationCategoryId,
  type NotificationChannels,
} from '@/app/account/settings/notification-category-metadata'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { detectPushDisabledReason } from '@/lib/push/push-availability'
import { trpc } from '@/trpc/client'
import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

interface NotificationSettingsPopoverProps {
  groupId: string
  currentUserId: string | undefined
  emailVerified?: boolean
}

export function NotificationSettingsPopover({
  groupId,
  currentUserId,
  emailVerified = false,
}: NotificationSettingsPopoverProps) {
  const t = useTranslations('Notifications')
  const tProfile = useTranslations('ProfileSettings')
  const utils = trpc.useUtils()
  const [savingCategory, setSavingCategory] =
    useState<ExpenseNotificationCategoryId | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [pushUnavailable, setPushUnavailable] = useState(false)

  const preferences =
    trpc.groupMembership.getGroupNotificationPreferences.useQuery(
      { groupId },
      { enabled: !!currentUserId },
    )
  const saveCategory =
    trpc.groupMembership.saveGroupNotificationCategory.useMutation()
  const resetPreferences =
    trpc.groupMembership.resetGroupNotificationPreferences.useMutation()

  useEffect(() => {
    setPushUnavailable(detectPushDisabledReason() !== null)
  }, [])

  async function updateCategory(
    category: ExpenseNotificationCategoryId,
    channels: NotificationChannels,
  ) {
    setSavingCategory(category)
    try {
      const updated = await saveCategory.mutateAsync({
        groupId,
        category,
        ...channels,
      })
      utils.groupMembership.getGroupNotificationPreferences.setData(
        { groupId },
        updated,
      )
    } catch {
      toast.error(t('subscribeError'))
    } finally {
      setSavingCategory(null)
    }
  }

  async function resetToAccount() {
    setIsResetting(true)
    try {
      const updated = await resetPreferences.mutateAsync({ groupId })
      utils.groupMembership.getGroupNotificationPreferences.setData(
        { groupId },
        updated,
      )
    } catch {
      toast.error(t('subscribeError'))
    } finally {
      setIsResetting(false)
    }
  }

  if (preferences.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {EXPENSE_NOTIFICATION_CATEGORY_IDS.map((category) => (
          <Skeleton key={category} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (!preferences.data || preferences.isError) {
    return <p className="p-4 text-sm text-destructive">{t('subscribeError')}</p>
  }

  const hasOverrides = Object.values(preferences.data.categories).some(
    (category) => category.isOverride,
  )
  const isBusy = savingCategory !== null || isResetting

  return (
    <div className="flex max-h-[min(32rem,80vh)] flex-col overflow-y-auto">
      <div className="divide-y">
        {EXPENSE_NOTIFICATION_CATEGORY_IDS.map((category) => {
          const channels = preferences.data.categories[category]
          const categoryBusy = savingCategory === category

          return (
            <div key={category} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {tProfile(`notifications.categories.${category}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tProfile(`notifications.categoryDescriptions.${category}`)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${category}-email`}
                    checked={channels.email}
                    disabled={isBusy || !emailVerified}
                    onCheckedChange={(checked) =>
                      void updateCategory(category, {
                        email: checked === true,
                        push: channels.push,
                      })
                    }
                  />
                  <Label
                    htmlFor={`${category}-email`}
                    className="cursor-pointer font-normal"
                  >
                    {tProfile('notifications.channelLabel.email')}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${category}-push`}
                    checked={channels.push}
                    disabled={isBusy || pushUnavailable}
                    onCheckedChange={(checked) =>
                      void updateCategory(category, {
                        email: channels.email,
                        push: checked === true,
                      })
                    }
                  />
                  <Label
                    htmlFor={`${category}-push`}
                    className="cursor-pointer font-normal"
                  >
                    {tProfile('notifications.channelLabel.push')}
                  </Label>
                </div>
                {categoryBusy ? (
                  <span className="text-xs text-muted-foreground">
                    {tProfile('notifications.saving')}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={!hasOverrides || isBusy}
          onClick={() => void resetToAccount()}
        >
          <RotateCcw data-icon="inline-start" />
          {t('followAccount')}
        </Button>
      </div>
    </div>
  )
}
