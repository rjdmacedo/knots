'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type PushSubscriptionPreferences } from '@/lib/push/subscription-filters'
import {
  isPushSupported,
  usePushNotificationSubscription,
} from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSpinDelay } from 'spin-delay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationSettingsPopoverProps {
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** If specific members are chosen but none remain, fall back to everyone. */
function normalizeMemberSelection(
  notifyAllOthers: boolean,
  selectedMemberIds: string[],
): { notifyAllOthers: boolean; selectedMemberIds: string[] } {
  if (!notifyAllOthers && selectedMemberIds.length === 0) {
    return { notifyAllOthers: true, selectedMemberIds: [] }
  }
  return { notifyAllOthers, selectedMemberIds }
}

// ---------------------------------------------------------------------------
// PushChannelRow
// ---------------------------------------------------------------------------

interface PushChannelRowProps {
  groupId: string
  currentUserId: string | undefined
  sharedPrefs: PushSubscriptionPreferences | null
}

function PushChannelRow({
  groupId,
  currentUserId,
  sharedPrefs,
}: PushChannelRowProps) {
  const t = useTranslations('Notifications')
  const vapidKeyMissing = !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const browserSupported = isPushSupported()

  const {
    isSubscribed,
    isLoading: pushLoading,
    error: pushError,
    subscribe,
    unsubscribe,
    clearError,
  } = usePushNotificationSubscription(groupId, currentUserId)

  const showPushLoading = useSpinDelay(pushLoading, {
    delay: 1000,
    minDuration: 1000,
  })

  // Determine disabled reason
  let disabledReason: string | null = null
  if (vapidKeyMissing) {
    disabledReason = t('pushUnavailable')
  } else if (!browserSupported) {
    disabledReason = t('notSupported')
  } else if (pushError === 'permissionDenied') {
    disabledReason = t('permissionDenied')
  }

  const isDisabled = disabledReason !== null || pushLoading || !currentUserId

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t('pushLabel')}</span>
        {showPushLoading ? (
          <div className="flex h-[18.4px] w-[32px] items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Switch
            checked={isSubscribed && !vapidKeyMissing && browserSupported}
            disabled={isDisabled}
            aria-label={t('pushLabel')}
            onCheckedChange={async (checked) => {
              clearError()
              if (checked) {
                await subscribe()
              } else {
                await unsubscribe()
              }
            }}
          />
        )}
      </div>
      {disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
      {pushError && pushError !== 'permissionDenied' && (
        <p className="text-xs text-destructive">{t('subscribeError')}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmailChannelRow
// ---------------------------------------------------------------------------

interface EmailChannelRowProps {
  groupId: string
  emailEnabled: boolean | undefined
  queryFailed: boolean
  onToggle: (enabled: boolean) => void
  isMutationPending: boolean
}

function EmailChannelRow({
  groupId: _groupId,
  emailEnabled,
  queryFailed,
  onToggle,
  isMutationPending,
}: EmailChannelRowProps) {
  const t = useTranslations('Notifications')
  const isEmailLoading = emailEnabled === undefined || isMutationPending
  const showEmailLoading = useSpinDelay(isEmailLoading, {
    delay: 1500,
    minDuration: 1000,
  })

  if (queryFailed) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('emailLabel')}</span>
          <Switch
            checked={false}
            disabled
            aria-label={t('emailLabel')}
            onCheckedChange={() => {}}
          />
        </div>
        <p className="text-xs text-destructive">{t('subscribeError')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t('emailLabel')}</span>
        {showEmailLoading ? (
          <div className="flex h-[18.4px] w-[32px] items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Switch
            checked={emailEnabled}
            disabled={isMutationPending}
            aria-label={t('emailLabel')}
            onCheckedChange={(checked) => onToggle(checked)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChannelsSection
// ---------------------------------------------------------------------------

interface ChannelsSectionProps {
  groupId: string
  currentUserId: string | undefined
  sharedPrefs: PushSubscriptionPreferences | null
  emailEnabled: boolean | undefined
  queryFailed: boolean
  onEmailToggle: (enabled: boolean) => void
  isEmailMutationPending: boolean
}

function ChannelsSection({
  groupId,
  currentUserId,
  sharedPrefs,
  emailEnabled,
  queryFailed,
  onEmailToggle,
  isEmailMutationPending,
}: ChannelsSectionProps) {
  const t = useTranslations('Notifications')

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t('channelsLabel')}</p>
      <PushChannelRow
        groupId={groupId}
        currentUserId={currentUserId}
        sharedPrefs={sharedPrefs}
      />
      <EmailChannelRow
        groupId={groupId}
        emailEnabled={emailEnabled}
        queryFailed={queryFailed}
        onToggle={onEmailToggle}
        isMutationPending={isEmailMutationPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MembersSection
// ---------------------------------------------------------------------------

interface MembersSectionProps {
  panelId: string
  otherMembers: Array<{ id: string; name: string }>
  notifyAllOthers: boolean
  selectedMemberIds: string[]
  isSaving: boolean
  onNotifyAllChange: (on: boolean) => void
  onMemberToggle: (memberId: string, on: boolean) => void
}

function MembersSection({
  panelId,
  otherMembers,
  notifyAllOthers,
  selectedMemberIds,
  isSaving,
  onNotifyAllChange,
  onMemberToggle,
}: MembersSectionProps) {
  const t = useTranslations('Notifications')

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('membersLabel')}</p>
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${panelId}-all`}
          checked={notifyAllOthers}
          disabled={isSaving}
          onCheckedChange={(checked) => {
            onNotifyAllChange(checked === true)
          }}
        />
        <Label
          htmlFor={`${panelId}-all`}
          className="cursor-pointer font-normal leading-snug"
        >
          {t('notifyAllMembers')}
        </Label>
      </div>
      {otherMembers.length > 0 && (
        <div className="flex flex-col gap-2 pl-1">
          <p className="text-xs text-muted-foreground">
            {t('notifySpecificMembers')}
          </p>
          {otherMembers.map((member) => {
            const checked =
              !notifyAllOthers && selectedMemberIds.includes(member.id)
            return (
              <div key={member.id} className="flex items-center gap-2">
                <Checkbox
                  id={`${panelId}-member-${member.id}`}
                  checked={checked}
                  disabled={isSaving}
                  onCheckedChange={(value) => {
                    onMemberToggle(member.id, value === true)
                  }}
                />
                <Label
                  htmlFor={`${panelId}-member-${member.id}`}
                  className="cursor-pointer truncate font-normal"
                >
                  {member.name}
                </Label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EventsSection
// ---------------------------------------------------------------------------

interface EventsSectionProps {
  panelId: string
  notifyOnCreate: boolean
  notifyOnUpdate: boolean
  notifyOnDelete: boolean
  isSaving: boolean
  onCreateChange: (on: boolean) => void
  onUpdateChange: (on: boolean) => void
  onDeleteChange: (on: boolean) => void
}

function EventsSection({
  panelId,
  notifyOnCreate,
  notifyOnUpdate,
  notifyOnDelete,
  isSaving,
  onCreateChange,
  onUpdateChange,
  onDeleteChange,
}: EventsSectionProps) {
  const t = useTranslations('Notifications')

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-sm font-medium">{t('eventsLabel')}</p>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${panelId}-create`}
          checked={notifyOnCreate}
          disabled={isSaving}
          onCheckedChange={(checked) => onCreateChange(checked === true)}
        />
        <Label
          htmlFor={`${panelId}-create`}
          className="cursor-pointer font-normal"
        >
          {t('eventCreate')}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${panelId}-update`}
          checked={notifyOnUpdate}
          disabled={isSaving}
          onCheckedChange={(checked) => onUpdateChange(checked === true)}
        />
        <Label
          htmlFor={`${panelId}-update`}
          className="cursor-pointer font-normal"
        >
          {t('eventUpdate')}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${panelId}-delete`}
          checked={notifyOnDelete}
          disabled={isSaving}
          onCheckedChange={(checked) => onDeleteChange(checked === true)}
        />
        <Label
          htmlFor={`${panelId}-delete`}
          className="cursor-pointer font-normal"
        >
          {t('eventDelete')}
        </Label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NotificationSettingsPopover (main export)
// ---------------------------------------------------------------------------

export function NotificationSettingsPopover({
  groupId,
  members,
  currentUserId,
}: NotificationSettingsPopoverProps) {
  const t = useTranslations('Notifications')
  const panelId = useId()

  // ---- Push state (from hook) ----
  const { isSubscribed: pushEnabled } = usePushNotificationSubscription(
    groupId,
    currentUserId,
  )

  // ---- Load all shared preferences in a single query ----
  const {
    data: prefsData,
    isError: prefsQueryFailed,
    isLoading: prefsLoading,
  } = trpc.groupMembership.getNotificationPreferences.useQuery(
    { groupId },
    { enabled: !!currentUserId },
  )

  // ---- Mutation for all saves ----
  const setPrefs = trpc.groupMembership.setNotificationPreferences.useMutation()

  // ---- Local state for email toggle ----
  const [emailEnabled, setEmailEnabled] = useState<boolean | undefined>(
    undefined,
  )
  const [isEmailMutationPending, setIsEmailMutationPending] = useState(false)

  // ---- Local filter state ----
  const [notifyAllOthers, setNotifyAllOthers] = useState(true)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [notifyOnCreate, setNotifyOnCreate] = useState(true)
  const [notifyOnUpdate, setNotifyOnUpdate] = useState(true)
  const [notifyOnDelete, setNotifyOnDelete] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Sync local state when preferences load
  useEffect(() => {
    if (!prefsData) return
    setEmailEnabled(prefsData.emailNotificationsEnabled)
    setNotifyAllOthers(prefsData.notifyAllMembers)
    setSelectedMemberIds(prefsData.includedUserIds)
    setNotifyOnCreate(prefsData.notifyOnCreate)
    setNotifyOnUpdate(prefsData.notifyOnUpdate)
    setNotifyOnDelete(prefsData.notifyOnDelete)
  }, [prefsData])

  // Members excluding self
  const otherMembers = useMemo(
    () => members.filter((m) => m.id !== currentUserId),
    [members, currentUserId],
  )

  // Shared prefs object to pass to PushChannelRow on subscribe
  const sharedPrefs: PushSubscriptionPreferences | null =
    prefsData && currentUserId
      ? {
          subscriberUserId: currentUserId,
          notifyAllMembers: prefsData.notifyAllMembers,
          includedUserIds: prefsData.includedUserIds,
          notifyOnCreate: prefsData.notifyOnCreate,
          notifyOnUpdate: prefsData.notifyOnUpdate,
          notifyOnDelete: prefsData.notifyOnDelete,
        }
      : null

  // Validation: at least one event AND at least one member selector active
  const isFilterValid =
    (notifyOnCreate || notifyOnUpdate || notifyOnDelete) &&
    (notifyAllOthers || selectedMemberIds.length > 0)

  // ---- Email toggle handler ----
  const handleEmailToggle = useCallback(
    async (enabled: boolean) => {
      const prevValue = emailEnabled
      setEmailEnabled(enabled)
      setIsEmailMutationPending(true)
      try {
        await setPrefs.mutateAsync({
          groupId,
          emailNotificationsEnabled: enabled,
        })
      } catch {
        setEmailEnabled(prevValue)
        toast.error(t('subscribeError'))
      } finally {
        setIsEmailMutationPending(false)
      }
    },
    [emailEnabled, groupId, setPrefs, t],
  )

  // ---- Filter save helper ----
  const saveFilters = useCallback(
    async (patch: {
      notifyAllMembers?: boolean
      includedUserIds?: string[]
      notifyOnCreate?: boolean
      notifyOnUpdate?: boolean
      notifyOnDelete?: boolean
    }) => {
      // Build the full resolved filter state to pass to updatePreferences
      const resolvedAllMembers = patch.notifyAllMembers ?? notifyAllOthers
      const resolvedIds = patch.includedUserIds ?? selectedMemberIds
      const resolvedCreate = patch.notifyOnCreate ?? notifyOnCreate
      const resolvedUpdate = patch.notifyOnUpdate ?? notifyOnUpdate
      const resolvedDelete = patch.notifyOnDelete ?? notifyOnDelete

      const isResolvedFilterValid =
        (resolvedCreate || resolvedUpdate || resolvedDelete) &&
        (resolvedAllMembers || resolvedIds.length > 0)

      if (!isResolvedFilterValid) return

      // Snapshot for revert
      const prevAllOthers = notifyAllOthers
      const prevIds = selectedMemberIds
      const prevCreate = notifyOnCreate
      const prevUpdate = notifyOnUpdate
      const prevDelete = notifyOnDelete

      setIsSaving(true)
      try {
        await setPrefs.mutateAsync({ groupId, ...patch })
      } catch {
        // Revert local state on GroupMembership save failure
        setNotifyAllOthers(prevAllOthers)
        setSelectedMemberIds(prevIds)
        setNotifyOnCreate(prevCreate)
        setNotifyOnUpdate(prevUpdate)
        setNotifyOnDelete(prevDelete)
        toast.error(t('subscribeError'))
      } finally {
        setIsSaving(false)
      }
    },
    [
      notifyAllOthers,
      selectedMemberIds,
      notifyOnCreate,
      notifyOnUpdate,
      notifyOnDelete,
      groupId,
      setPrefs,
      t,
    ],
  )

  // ---- Member change handlers ----
  const handleNotifyAllChange = useCallback(
    (on: boolean) => {
      const nextIds = on ? [] : selectedMemberIds
      setNotifyAllOthers(on)
      if (on) setSelectedMemberIds([])
      void saveFilters({
        notifyAllMembers: on,
        includedUserIds: on ? [] : nextIds,
      })
    },
    [selectedMemberIds, saveFilters],
  )

  const handleMemberToggle = useCallback(
    (memberId: string, on: boolean) => {
      let nextIds = on
        ? Array.from(new Set([...selectedMemberIds, memberId]))
        : selectedMemberIds.filter((id) => id !== memberId)
      let nextAllOthers = false
      const normalized = normalizeMemberSelection(nextAllOthers, nextIds)
      nextAllOthers = normalized.notifyAllOthers
      nextIds = normalized.selectedMemberIds
      setNotifyAllOthers(nextAllOthers)
      setSelectedMemberIds(nextIds)
      void saveFilters({
        notifyAllMembers: nextAllOthers,
        includedUserIds: nextIds,
      })
    },
    [selectedMemberIds, saveFilters],
  )

  // ---- Event change handlers ----
  const handleCreateChange = useCallback(
    (on: boolean) => {
      setNotifyOnCreate(on)
      void saveFilters({ notifyOnCreate: on })
    },
    [saveFilters],
  )

  const handleUpdateChange = useCallback(
    (on: boolean) => {
      setNotifyOnUpdate(on)
      void saveFilters({ notifyOnUpdate: on })
    },
    [saveFilters],
  )

  const handleDeleteChange = useCallback(
    (on: boolean) => {
      setNotifyOnDelete(on)
      void saveFilters({ notifyOnDelete: on })
    },
    [saveFilters],
  )

  // ---- Visibility ----
  // At least one channel enabled means we should show Members + Events
  const atLeastOneChannelEnabled = pushEnabled || (emailEnabled ?? false)
  const showFilters =
    atLeastOneChannelEnabled && !!currentUserId && !prefsLoading

  return (
    <div className="flex flex-col">
      {/* Channels section */}
      <div className="border-b px-4 py-3">
        <ChannelsSection
          groupId={groupId}
          currentUserId={currentUserId}
          sharedPrefs={sharedPrefs}
          emailEnabled={emailEnabled}
          queryFailed={prefsQueryFailed}
          onEmailToggle={handleEmailToggle}
          isEmailMutationPending={isEmailMutationPending}
        />
      </div>

      {/* Hint when both channels disabled */}
      {!atLeastOneChannelEnabled && !prefsLoading && (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t('enableChannelHint')}
          </p>
        </div>
      )}

      {/* Members + Events filter sections */}
      {showFilters && (
        <div className="flex max-h-[min(24rem,70vh)] flex-col gap-4 overflow-y-auto px-4 py-3">
          <MembersSection
            panelId={panelId}
            otherMembers={otherMembers}
            notifyAllOthers={notifyAllOthers}
            selectedMemberIds={selectedMemberIds}
            isSaving={isSaving}
            onNotifyAllChange={handleNotifyAllChange}
            onMemberToggle={handleMemberToggle}
          />
          <EventsSection
            panelId={panelId}
            notifyOnCreate={notifyOnCreate}
            notifyOnUpdate={notifyOnUpdate}
            notifyOnDelete={notifyOnDelete}
            isSaving={isSaving}
            onCreateChange={handleCreateChange}
            onUpdateChange={handleUpdateChange}
            onDeleteChange={handleDeleteChange}
          />
          {!isFilterValid && (
            <p className="text-xs text-destructive">
              {t('selectAtLeastOneFilter')}
            </p>
          )}
        </div>
      )}

      {/* Preferences loading error (non-email sections remain functional) */}
      {prefsQueryFailed && (
        <div className="border-t px-4 py-3">
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="size-4" />
            <AlertDescription>{t('subscribeError')}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}
