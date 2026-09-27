'use client'

import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { useMediaQuery } from '@/lib/hooks'
import {
  detectPushDisabledReason,
  type PushDisabledReason,
} from '@/lib/push/push-availability'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Bell, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as React from 'react'
import {
  LIVE_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_GROUPS,
  type NotificationCategory,
  type NotificationChannels,
  type NotificationGroupId,
} from './notification-category-metadata'
import { channelLabelKey, toggleChannel } from './notification-channels'
import {
  SettingsBadge,
  SettingsGroup,
  SettingsList,
  SettingsRow,
  SettingsSaving,
  SettingsSection,
  SettingsSectionSkeleton,
} from './settings-ui'

/**
 * Notifications section (task 7.3).
 *
 * Owns the master switch and the per-category `ChannelSelector` rows. The draft
 * channel state is initialized from `profile.notificationPreferences` and
 * mutated optimistically: toggling a channel saves that one category, rolls the
 * row back and toasts on failure, and disables the other rows while a save is in
 * flight (requirement 9.7).
 *
 * The This device group (task 7.4) is rendered through `deviceSlot`, kept
 * OUTSIDE the master-switch conditional so it stays visible when the master
 * switch is off (requirement 9.2).
 */

// ---------------------------------------------------------------------------
// ChannelSelector — Popover (md+) / Drawer (below md) with toggle buttons.
// ---------------------------------------------------------------------------

interface ChannelSelectorProps {
  /** Row label, used to caption the panel. */
  categoryLabel: string
  /** Current channel selection for the row. */
  channels: NotificationChannels
  /** Whether the trigger and toggles are disabled (another save in flight). */
  disabled: boolean
  /** Whether Email can be toggled (false when there is no verified email). */
  emailAvailable: boolean
  /** Why Push is unavailable, or null when it can be toggled. */
  pushDisabledReason: PushDisabledReason
  /** Toggle a single channel. */
  onToggle: (which: 'email' | 'push') => void
}

function ChannelSelector({
  categoryLabel,
  channels,
  disabled,
  emailAvailable,
  pushDisabledReason,
  onToggle,
}: ChannelSelectorProps) {
  const t = useTranslations('ProfileSettings')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = React.useState(false)

  const closedLabel = t(
    `notifications.channelLabel.${channelLabelKey(channels)}`,
  )

  const pushReasonCopy = pushDisabledReason
    ? t(`notifications.pushDisabled.${pushDisabledReason}`)
    : null

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={t('notifications.channelSelectorAria', {
        category: categoryLabel,
      })}
    >
      <span>{closedLabel}</span>
    </Button>
  )

  const body = (
    <div className="flex flex-col gap-1">
      <ChannelToggle
        label={t('notifications.channelLabel.email')}
        checked={channels.email}
        disabled={disabled || !emailAvailable}
        onSelect={() => onToggle('email')}
      />
      {!emailAvailable ? (
        <a
          href="#account-settings-email"
          className="px-2 text-xs text-primary underline underline-offset-2"
          onClick={() => setOpen(false)}
        >
          {t('notifications.emailNeedsVerification')}
        </a>
      ) : null}

      <ChannelToggle
        label={t('notifications.channelLabel.push')}
        checked={channels.push}
        disabled={disabled || pushDisabledReason !== null}
        onSelect={() => onToggle('push')}
      />
      {pushReasonCopy ? (
        <p className="px-2 text-xs text-muted-foreground">{pushReasonCopy}</p>
      ) : null}
    </div>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={trigger} />
        <PopoverContent align="end" className="w-56 p-2">
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{categoryLabel}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-2">{body}</div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" size="sm">
              {t('notifications.done')}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

interface ChannelToggleProps {
  label: string
  checked: boolean
  disabled: boolean
  onSelect: () => void
}

/** A single row inside the selector: a toggle button with a checkmark. */
function ChannelToggle({
  label,
  checked,
  disabled,
  onSelect,
}: ChannelToggleProps) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <span>{label}</span>
      <Check
        className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// NotificationsPreferences
// ---------------------------------------------------------------------------

interface NotificationsPreferencesProps {
  /** Initial master-switch value from the loaded profile. */
  notificationsEnabled: boolean
  /** Whether the user has a verified deliverable email (null when not). */
  emailVerified: Date | null
  /** Placeholder for the This device group (task 7.4). Rendered when present. */
  deviceSlot?: React.ReactNode
}

const GROUP_TITLE_KEY: Record<NotificationGroupId, string> = {
  'groups-and-friends': 'groups.groups-and-friends',
  expenses: 'groups.expenses',
  summaries: 'groups.summaries',
}

export function NotificationsPreferences({
  notificationsEnabled: initialEnabled,
  emailVerified,
  deviceSlot,
}: NotificationsPreferencesProps) {
  const t = useTranslations('ProfileSettings')
  const utils = trpc.useUtils()

  const prefsQuery = trpc.profile.notificationPreferences.useQuery()

  const setEnabled = trpc.profile.setNotificationsEnabled.useMutation()
  const saveCategory = trpc.profile.saveNotificationCategory.useMutation()

  // Master switch draft, seeded from the profile then reconciled with the query.
  const [masterEnabled, setMasterEnabled] = React.useState(initialEnabled)
  const [masterPending, setMasterPending] = React.useState(false)

  // Per-category channel draft.
  const [draft, setDraft] = React.useState<
    Record<string, NotificationChannels>
  >({})
  // The category id whose save is currently in flight (disables other rows).
  const [savingCategory, setSavingCategory] = React.useState<string | null>(
    null,
  )

  // Seed drafts from the query once it resolves.
  React.useEffect(() => {
    if (!prefsQuery.data) return
    setDraft(prefsQuery.data.categories)
    setMasterEnabled(prefsQuery.data.notificationsEnabled)
  }, [prefsQuery.data])

  const emailAvailable = emailVerified !== null

  // Detect push availability once on the client.
  const [pushDisabledReason, setPushDisabledReason] =
    React.useState<PushDisabledReason>(null)
  React.useEffect(() => {
    setPushDisabledReason(detectPushDisabledReason())
  }, [])

  async function handleMasterToggle(next: boolean) {
    const previous = masterEnabled
    setMasterEnabled(next)
    setMasterPending(true)
    try {
      await setEnabled.mutateAsync({ enabled: next })
      utils.profile.notificationPreferences.setData(undefined, (old) =>
        old ? { ...old, notificationsEnabled: next } : old,
      )
    } catch {
      setMasterEnabled(previous)
      toast.error(t('notifications.saveError'))
    } finally {
      setMasterPending(false)
    }
  }

  async function handleChannelToggle(
    categoryId: string,
    which: 'email' | 'push',
  ) {
    const current = draft[categoryId] ?? { email: false, push: false }
    const next = toggleChannel(current, which)
    const previous = current

    setDraft((prev) => ({ ...prev, [categoryId]: next }))
    setSavingCategory(categoryId)
    try {
      await saveCategory.mutateAsync({
        category: categoryId,
        email: next.email,
        push: next.push,
      })
      utils.profile.notificationPreferences.setData(undefined, (old) =>
        old
          ? { ...old, categories: { ...old.categories, [categoryId]: next } }
          : old,
      )
      toast.success(t('notifications.saveSuccess'))
    } catch {
      setDraft((prev) => ({ ...prev, [categoryId]: previous }))
      toast.error(t('notifications.saveError'))
    } finally {
      setSavingCategory(null)
    }
  }

  const masterSwitch = (
    <Switch
      checked={masterEnabled}
      disabled={masterPending || prefsQuery.isLoading}
      aria-label={t('notifications.masterSwitchAria')}
      onCheckedChange={handleMasterToggle}
    />
  )

  if (prefsQuery.isLoading) {
    return <SettingsSectionSkeleton icon={Bell} rows={4} />
  }

  const liveIds = new Set(LIVE_NOTIFICATION_CATEGORIES.map((c) => c.id))

  return (
    <SettingsSection
      icon={Bell}
      title={t('notificationsTitle')}
      description={t('notificationsDescription')}
      status={
        <div className="flex items-center gap-3">
          {savingCategory || masterPending ? (
            <SettingsSaving label={t('notifications.saving')} />
          ) : null}
          {masterSwitch}
        </div>
      }
    >
      {masterEnabled ? (
        <>
          {NOTIFICATION_GROUPS.map((groupId) => {
            const categories = NOTIFICATION_CATEGORIES.filter(
              (c) => c.group === groupId,
            )
            return (
              <SettingsGroup
                key={groupId}
                title={t(`notifications.${GROUP_TITLE_KEY[groupId]}`)}
              >
                <SettingsList>
                  {categories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      channels={
                        draft[category.id] ?? { email: false, push: false }
                      }
                      isLive={liveIds.has(category.id)}
                      // Disable this row's control while ANOTHER row is saving.
                      disabled={
                        savingCategory !== null &&
                        savingCategory !== category.id
                      }
                      emailAvailable={emailAvailable}
                      pushDisabledReason={pushDisabledReason}
                      onToggle={(which) =>
                        handleChannelToggle(category.id, which)
                      }
                    />
                  ))}
                </SettingsList>
              </SettingsGroup>
            )
          })}
        </>
      ) : null}

      {/* This device group (task 7.4) — stays visible when master is off. */}
      {deviceSlot}
    </SettingsSection>
  )
}

interface CategoryRowProps {
  category: NotificationCategory
  channels: NotificationChannels
  isLive: boolean
  disabled: boolean
  emailAvailable: boolean
  pushDisabledReason: PushDisabledReason
  onToggle: (which: 'email' | 'push') => void
}

function CategoryRow({
  category,
  channels,
  isLive,
  disabled,
  emailAvailable,
  pushDisabledReason,
  onToggle,
}: CategoryRowProps) {
  const t = useTranslations('ProfileSettings')
  const messageKey = category.i18nKey ?? category.id
  const label = t(`notifications.categories.${messageKey}`)
  const descriptionKey = `notifications.categoryDescriptions.${messageKey}`
  const description = t.has(descriptionKey) ? t(descriptionKey) : undefined

  if (!isLive) {
    // Coming soon: one badge, no control, reduced opacity (requirement 9.12).
    return (
      <SettingsRow
        className="opacity-60"
        label={label}
        description={description}
        control={<SettingsBadge>{t('notifications.comingSoon')}</SettingsBadge>}
      />
    )
  }

  return (
    <SettingsRow
      label={label}
      control={
        <ChannelSelector
          categoryLabel={label}
          channels={channels}
          disabled={disabled}
          emailAvailable={emailAvailable}
          pushDisabledReason={pushDisabledReason}
          onToggle={onToggle}
        />
      }
    />
  )
}
