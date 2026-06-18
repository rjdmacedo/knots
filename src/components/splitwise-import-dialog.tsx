'use client'

import { FriendPicker, type FriendSelection } from '@/components/friend-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useImportDialogDismiss } from '@/components/use-import-dialog-dismiss'
import { isAbortError } from '@/lib/abort-signal'
import { trpc } from '@/trpc/client'
import { Loader2, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const ADD_NEW_VALUE = '__add_new__'

type ParticipantLink = {
  /** Mapped existing group member, when not adding someone new */
  memberUserId: string | null
  /** Friend picked on the "add new member" path */
  newMember: FriendSelection | null
}

export function SplitwiseImportDialog({
  open,
  onOpenChange,
  groupId,
  onImportComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  onImportComplete?: () => void
}) {
  const t = useTranslations('SplitwiseImport')
  const [csvContent, setCsvContent] = useState('')
  const [participantLinks, setParticipantLinks] = useState<
    Record<string, ParticipantLink>
  >({})
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()

  const { data: groupDetails } = trpc.groups.getDetails.useQuery(
    { groupId },
    { enabled: open },
  )
  const groupMembers = groupDetails?.group.participants ?? []

  const handleImportAbort = useCallback(() => {
    setIsImporting(false)
  }, [])

  const {
    mutateAsync: previewImport,
    data: analysis,
    reset: resetAnalysis,
    isPending: isAnalyzing,
    error: analysisError,
  } = trpc.groups.expenses.previewSplitwiseImport.useMutation()

  const {
    handleDialogOpenChange,
    handleCloseClick,
    beginImport,
    getImportSignal,
    isImportCancelled,
    resetImportCancelled,
  } = useImportDialogDismiss(isImporting, onOpenChange, handleImportAbort)

  useEffect(() => {
    if (open) {
      resetImportCancelled()
      return
    }

    setIsImporting(false)
    setCsvContent('')
    setParticipantLinks({})
    resetAnalysis()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [open, resetAnalysis, resetImportCancelled])

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error(t('toast.invalidFileType.title'), {
        description: t('toast.invalidFileType.description'),
      })
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      setCsvContent(content)
      setParticipantLinks({})
      resetAnalysis()

      try {
        const result = await previewImport({ groupId, csvContent: content })
        setParticipantLinks(
          Object.fromEntries(
            result.csvParticipants.map((participant) => [
              participant.csvName,
              {
                memberUserId: participant.suggestedUserId,
                newMember: null,
              },
            ]),
          ),
        )
      } catch (error) {
        console.error('Preview failed:', error)
      }
    }
    reader.readAsText(file)
  }

  const handleClear = () => {
    setCsvContent('')
    setParticipantLinks({})
    resetAnalysis()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const updateLink = (csvName: string, patch: Partial<ParticipantLink>) => {
    setParticipantLinks((current) => ({
      ...current,
      [csvName]: { ...current[csvName], ...patch },
    }))
  }

  const handleImport = async () => {
    if (!csvContent.trim()) {
      toast.error(t('toast.noContent.title'), {
        description: t('toast.noContent.description'),
      })
      return
    }

    const csvParticipants = analysis?.csvParticipants ?? []
    const participantMappings: Record<string, string> = {}
    const membersToAdd: Array<{
      exportName: string
      userId?: string
      email?: string
      name?: string
    }> = []

    for (const participant of csvParticipants) {
      const link = participantLinks[participant.csvName]
      if (!link) {
        toast.error(t('toast.incompleteMapping.title'), {
          description: t('toast.incompleteMapping.description', {
            name: participant.csvName,
          }),
        })
        return
      }

      if (link.memberUserId) {
        participantMappings[participant.csvName] = link.memberUserId
        continue
      }

      const newMember = link.newMember
      if (!newMember) {
        toast.error(t('toast.incompleteMapping.title'), {
          description: t('toast.incompleteMapping.description', {
            name: participant.csvName,
          }),
        })
        return
      }

      if (newMember.userId) {
        membersToAdd.push({
          exportName: participant.csvName,
          userId: newMember.userId,
          name: newMember.name || participant.csvName,
        })
        continue
      }

      const email = newMember.email.trim()
      if (!email.includes('@')) {
        toast.error(t('toast.missingEmail.title'), {
          description: t('toast.missingEmail.description', {
            name: participant.csvName,
          }),
        })
        return
      }

      membersToAdd.push({
        exportName: participant.csvName,
        email,
        name: newMember.name || participant.csvName,
      })
    }

    try {
      beginImport()
      setIsImporting(true)

      const result = await utils.client.groups.expenses.importSplitwise.mutate(
        {
          groupId,
          csvContent,
          membersToAdd,
          participantMappings,
        },
        { signal: getImportSignal() },
      )

      if (isImportCancelled()) {
        return
      }

      toast.success(t('toast.success.title'), {
        description: t('toast.success.description', {
          count: result.importedCount,
        }),
      })

      utils.groups.expenses.invalidate()
      utils.groups.get.invalidate({ groupId })
      utils.groups.getDetails.invalidate({ groupId })
      onOpenChange(false)
      handleClear()
      onImportComplete?.()
    } catch (error) {
      if (isImportCancelled() || isAbortError(error)) {
        toast.message(t('toast.cancelled.title'), {
          description: t('toast.cancelled.description'),
        })
        return
      }
      console.error('Import failed:', error)
      toast.error(t('toast.error.title'), {
        description:
          error instanceof Error ? error.message : t('toast.error.description'),
      })
    } finally {
      setIsImporting(false)
    }
  }

  const previewLines = csvContent.split('\n').slice(0, 10)
  const isBusy = isImporting || isAnalyzing
  const csvParticipants = analysis?.csvParticipants ?? []
  const matchedCount = csvParticipants.filter(
    (p) => p.suggestedUserId != null,
  ).length

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isImporting}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="splitwise-import-file">{t('fileLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="splitwise-import-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                disabled={isBusy}
                className="flex-1"
              />
              {csvContent && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleClear}
                        disabled={isBusy}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    <p>{t('clear')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('analyzing')}
            </div>
          )}

          {analysisError && (
            <p className="text-sm text-destructive">{analysisError.message}</p>
          )}

          {analysis && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p>{t('expenseCount', { count: analysis.expenseCount })}</p>
              {matchedCount > 0 && (
                <p className="text-muted-foreground">
                  {t('autoMatchedCount', { count: matchedCount })}
                </p>
              )}
            </div>
          )}

          {csvParticipants.length > 0 && (
            <div className="space-y-3">
              <div>
                <Label>{t('participantMappingLabel')}</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('participantMappingDescription')}
                </p>
              </div>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {csvParticipants.map((participant) => {
                  const link = participantLinks[participant.csvName]
                  const selectValue = link?.memberUserId ?? ADD_NEW_VALUE

                  return (
                    <div
                      key={participant.csvName}
                      className="rounded-md border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{participant.csvName}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {t('expenseReferences', {
                            count: participant.expenseCount,
                          })}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>{t('mapToMemberLabel')}</Label>
                        <Select
                          items={[
                            ...groupMembers.map((member) => ({
                              value: member.id,
                              label: member.name,
                            })),
                            {
                              value: ADD_NEW_VALUE,
                              label: t('addNewMemberOption'),
                            },
                          ]}
                          value={selectValue}
                          onValueChange={(value) => {
                            if (value === ADD_NEW_VALUE) {
                              updateLink(participant.csvName, {
                                memberUserId: null,
                              })
                            } else {
                              updateLink(participant.csvName, {
                                memberUserId: value,
                                newMember: null,
                              })
                            }
                          }}
                          disabled={isBusy}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t('mapToMemberPlaceholder')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {groupMembers.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={ADD_NEW_VALUE}>
                              {t('addNewMemberOption')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectValue === ADD_NEW_VALUE && (
                        <div className="space-y-1">
                          <Label>{t('friendLabel')}</Label>
                          <FriendPicker
                            value={link?.newMember ?? null}
                            excludeUserIds={groupMembers.map(
                              (member) => member.id,
                            )}
                            onSelect={(selection: FriendSelection) =>
                              updateLink(participant.csvName, {
                                newMember: selection,
                              })
                            }
                            placeholder={t('friendPlaceholder')}
                            disabled={isBusy}
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('softCreateHint')}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {csvContent && !isAnalyzing && (
            <div className="space-y-2">
              <Label>{t('previewLabel')}</Label>
              <div className="p-3 bg-muted rounded-md text-sm font-mono overflow-auto max-h-32">
                {previewLines.map((line, index) => (
                  <div key={index} className="break-all whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
                {csvContent.split('\n').length > 10 && (
                  <div className="text-muted-foreground">...</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCloseClick}
              disabled={isAnalyzing}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!csvContent || isBusy || isAnalyzing}
              className="gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('importing')}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {t('import')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
