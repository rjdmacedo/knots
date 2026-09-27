'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { trpc } from '@/trpc/client'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

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

  const utils = trpc.useUtils()

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

  const persistPrefs = useCallback(
    async (patch: {
      notifyAllMembers?: boolean
      includedUserIds?: string[]
      notifyOnCreate?: boolean
      notifyOnUpdate?: boolean
      notifyOnDelete?: boolean
    }) => {
      const updated = await setPrefs.mutateAsync({ groupId, ...patch })
      utils.groupMembership.getNotificationPreferences.setData(
        { groupId },
        updated,
      )
      return updated
    },
    [groupId, setPrefs, utils],
  )

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

  // Validation: at least one event AND at least one member selector active
  const isFilterValid =
    (notifyOnCreate || notifyOnUpdate || notifyOnDelete) &&
    (notifyAllOthers || selectedMemberIds.length > 0)

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
        await persistPrefs(patch)
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
      persistPrefs,
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

  const showFilters = !!currentUserId && !prefsLoading

  return (
    <div className="flex flex-col">
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
