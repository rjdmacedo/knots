'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  defaultPushPreferences,
  type PushSubscriptionPreferences,
} from '@/lib/push/subscription-filters'
import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { AlertCircle, Bell, BellOff, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

interface PushNotificationToggleProps {
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}

/** If specific members are chosen but none remain, fall back to everyone (except self). */
function normalizeMemberSelection(
  notifyAllOthers: boolean,
  selectedMemberIds: string[],
): { notifyAllOthers: boolean; selectedMemberIds: string[] } {
  if (!notifyAllOthers && selectedMemberIds.length === 0) {
    return { notifyAllOthers: true, selectedMemberIds: [] }
  }
  return { notifyAllOthers, selectedMemberIds }
}

function preferencesFromState(
  currentUserId: string,
  notifyAllOthers: boolean,
  selectedMemberIds: string[],
  notifyOnCreate: boolean,
  notifyOnUpdate: boolean,
  notifyOnDelete: boolean,
): PushSubscriptionPreferences {
  const members = normalizeMemberSelection(notifyAllOthers, selectedMemberIds)
  return {
    subscriberUserId: currentUserId,
    notifyAllMembers: members.notifyAllOthers,
    includedUserIds: members.notifyAllOthers ? [] : members.selectedMemberIds,
    notifyOnCreate,
    notifyOnUpdate,
    notifyOnDelete,
  }
}

export function PushNotificationToggle({
  groupId,
  members,
  currentUserId,
}: PushNotificationToggleProps) {
  const t = useTranslations('Notifications')
  const panelId = useId()
  const {
    isSupported,
    isSubscribed,
    isLoading,
    preferences,
    error,
    subscribe,
    unsubscribe,
    updatePreferences,
    clearError,
  } = usePushNotificationSubscription(groupId, currentUserId)

  const otherMembers = useMemo(
    () => members.filter((m) => m.id !== currentUserId),
    [members, currentUserId],
  )

  const [notifyAllOthers, setNotifyAllOthers] = useState(true)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [notifyOnCreate, setNotifyOnCreate] = useState(true)
  const [notifyOnUpdate, setNotifyOnUpdate] = useState(true)
  const [notifyOnDelete, setNotifyOnDelete] = useState(true)

  useEffect(() => {
    if (!preferences) return
    setNotifyAllOthers(preferences.notifyAllMembers)
    setSelectedMemberIds(preferences.includedUserIds)
    setNotifyOnCreate(preferences.notifyOnCreate)
    setNotifyOnUpdate(preferences.notifyOnUpdate)
    setNotifyOnDelete(preferences.notifyOnDelete)
  }, [preferences])

  const buildPrefs = useCallback(() => {
    if (!currentUserId) return null
    return preferencesFromState(
      currentUserId,
      notifyAllOthers,
      selectedMemberIds,
      notifyOnCreate,
      notifyOnUpdate,
      notifyOnDelete,
    )
  }, [
    currentUserId,
    notifyAllOthers,
    selectedMemberIds,
    notifyOnCreate,
    notifyOnUpdate,
    notifyOnDelete,
  ])

  const canSavePreferences =
    (notifyOnCreate || notifyOnUpdate || notifyOnDelete) &&
    (notifyAllOthers || selectedMemberIds.length > 0)

  const savePreferences = useCallback(
    async (prefs: PushSubscriptionPreferences) => {
      const valid =
        (prefs.notifyOnCreate ||
          prefs.notifyOnUpdate ||
          prefs.notifyOnDelete) &&
        (prefs.notifyAllMembers || prefs.includedUserIds.length > 0)
      if (!valid || !isSubscribed) return
      clearError()
      await updatePreferences(prefs)
    },
    [clearError, isSubscribed, updatePreferences],
  )

  if (!isSupported) {
    return null
  }

  const showFilters = isSubscribed && !!currentUserId

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              disabled={isLoading}
              aria-controls={panelId}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isSubscribed ? (
                <Bell className="size-4" />
              ) : (
                <BellOff className="size-4" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isSubscribed ? t('unsubscribe') : t('subscribe')}</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        id={panelId}
        align="end"
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm leading-none font-medium">
                {t('subscribe')}
              </p>
              {!isSubscribed && (
                <p className="text-xs text-muted-foreground">
                  {t('filterHint')}
                </p>
              )}
            </div>
            <Switch
              checked={isSubscribed}
              disabled={isLoading || !currentUserId}
              aria-label={isSubscribed ? t('unsubscribe') : t('subscribe')}
              onCheckedChange={async (checked) => {
                clearError()
                if (checked) {
                  const prefs =
                    buildPrefs() ??
                    (currentUserId
                      ? defaultPushPreferences(currentUserId)
                      : null)
                  if (prefs) await subscribe(prefs)
                } else {
                  await unsubscribe()
                }
              }}
            />
          </div>

          {showFilters && (
            <div className="flex max-h-[min(24rem,70vh)] flex-col gap-4 overflow-y-auto px-4 py-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{t('membersLabel')}</p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`${panelId}-all`}
                    checked={notifyAllOthers}
                    disabled={isLoading}
                    onCheckedChange={(checked) => {
                      const on = checked === true
                      const nextIds = on ? [] : selectedMemberIds
                      setNotifyAllOthers(on)
                      if (on) setSelectedMemberIds([])
                      if (currentUserId) {
                        void savePreferences(
                          preferencesFromState(
                            currentUserId,
                            on,
                            nextIds,
                            notifyOnCreate,
                            notifyOnUpdate,
                            notifyOnDelete,
                          ),
                        )
                      }
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
                        !notifyAllOthers &&
                        selectedMemberIds.includes(member.id)
                      return (
                        <div
                          key={member.id}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            id={`${panelId}-member-${member.id}`}
                            checked={checked}
                            disabled={isLoading}
                            onCheckedChange={(value) => {
                              const on = value === true
                              let nextIds = on
                                ? Array.from(
                                    new Set([
                                      ...selectedMemberIds,
                                      member.id,
                                    ]),
                                  )
                                : selectedMemberIds.filter(
                                    (id) => id !== member.id,
                                  )
                              let nextAllOthers = false
                              const normalized = normalizeMemberSelection(
                                nextAllOthers,
                                nextIds,
                              )
                              nextAllOthers = normalized.notifyAllOthers
                              nextIds = normalized.selectedMemberIds
                              setNotifyAllOthers(nextAllOthers)
                              setSelectedMemberIds(nextIds)
                              if (currentUserId) {
                                void savePreferences(
                                  preferencesFromState(
                                    currentUserId,
                                    nextAllOthers,
                                    nextIds,
                                    notifyOnCreate,
                                    notifyOnUpdate,
                                    notifyOnDelete,
                                  ),
                                )
                              }
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

              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-sm font-medium">{t('eventsLabel')}</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${panelId}-create`}
                    checked={notifyOnCreate}
                    disabled={isLoading}
                    onCheckedChange={(checked) => {
                      const on = checked === true
                      setNotifyOnCreate(on)
                      if (currentUserId) {
                        void savePreferences(
                          preferencesFromState(
                            currentUserId,
                            notifyAllOthers,
                            selectedMemberIds,
                            on,
                            notifyOnUpdate,
                            notifyOnDelete,
                          ),
                        )
                      }
                    }}
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
                    disabled={isLoading}
                    onCheckedChange={(checked) => {
                      const on = checked === true
                      setNotifyOnUpdate(on)
                      if (currentUserId) {
                        void savePreferences(
                          preferencesFromState(
                            currentUserId,
                            notifyAllOthers,
                            selectedMemberIds,
                            notifyOnCreate,
                            on,
                            notifyOnDelete,
                          ),
                        )
                      }
                    }}
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
                    disabled={isLoading}
                    onCheckedChange={(checked) => {
                      const on = checked === true
                      setNotifyOnDelete(on)
                      if (currentUserId) {
                        void savePreferences(
                          preferencesFromState(
                            currentUserId,
                            notifyAllOthers,
                            selectedMemberIds,
                            notifyOnCreate,
                            notifyOnUpdate,
                            on,
                          ),
                        )
                      }
                    }}
                  />
                  <Label
                    htmlFor={`${panelId}-delete`}
                    className="cursor-pointer font-normal"
                  >
                    {t('eventDelete')}
                  </Label>
                </div>
              </div>

              {!canSavePreferences && (
                <p className="text-xs text-destructive">
                  {t('selectAtLeastOneFilter')}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="border-t px-4 py-3">
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="size-4" />
                <AlertDescription>{t(error)}</AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
