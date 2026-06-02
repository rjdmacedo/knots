'use client'

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

type MissingParticipant = {
  exportName: string
  expenseCount: number
}

export function KnotsImportDialog({
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
  const t = useTranslations('KnotsImport')
  const [fileContent, setFileContent] = useState('')
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({})
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()
  const handleImportAbort = useCallback(() => {
    setIsImporting(false)
  }, [])

  const {
    mutateAsync: previewImport,
    data: analysis,
    reset: resetAnalysis,
    isPending: isAnalyzing,
    error: analysisError,
  } = trpc.groups.expenses.previewKnotsImport.useMutation()

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
    setFileContent('')
    setMemberEmails({})
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

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.json') && !lowerName.endsWith('.csv')) {
      toast.error(t('toast.invalidFileType.title'), {
        description: t('toast.invalidFileType.description'),
      })
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const content = e.target?.result as string
      setFileContent(content)
      setMemberEmails({})
      resetAnalysis()

      try {
        const result = await previewImport({ groupId, fileContent: content })
        setMemberEmails(
          Object.fromEntries(
            result.missingParticipants.map((participant) => [
              participant.exportName,
              '',
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
    setFileContent('')
    setMemberEmails({})
    resetAnalysis()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const missingParticipants = analysis?.missingParticipants ?? []
  const hasMissingParticipants = missingParticipants.length > 0

  const handleImport = async () => {
    if (!fileContent.trim()) {
      toast.error(t('toast.noContent.title'), {
        description: t('toast.noContent.description'),
      })
      return
    }

    if (hasMissingParticipants) {
      const missingEmail = missingParticipants.find((participant) => {
        const email = memberEmails[participant.exportName]?.trim()
        return !email || !email.includes('@')
      })

      if (missingEmail) {
        toast.error(t('toast.missingEmail.title'), {
          description: t('toast.missingEmail.description', {
            name: missingEmail.exportName,
          }),
        })
        return
      }
    }

    try {
      beginImport()
      setIsImporting(true)

      const membersToAdd = missingParticipants.map((participant) => ({
        exportName: participant.exportName,
        email: memberEmails[participant.exportName].trim(),
        name: participant.exportName,
      }))

      const result = await utils.client.groups.expenses.importKnots.mutate(
        {
          groupId,
          fileContent,
          membersToAdd,
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

  const previewLines = fileContent.split('\n').slice(0, 10)
  const isBusy = isAnalyzing || isImporting

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!isImporting}
        onInteractOutside={(event) => {
          if (isImporting) {
            event.preventDefault()
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isImporting) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="knots-import-file">{t('fileLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="knots-import-file"
                type="file"
                accept=".json,.csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                disabled={isBusy}
                className="flex-1"
              />
              {fileContent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleClear}
                      disabled={isBusy}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
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
              {analysis.matchedParticipants.length > 0 && (
                <p className="text-muted-foreground">
                  {t('matchedParticipants', {
                    names: analysis.matchedParticipants
                      .map((p) => p.exportName)
                      .join(', '),
                  })}
                </p>
              )}
            </div>
          )}

          {hasMissingParticipants && (
            <div className="space-y-3">
              <div>
                <Label>{t('missingParticipantsLabel')}</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('missingParticipantsDescription')}
                </p>
              </div>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {missingParticipants.map((participant: MissingParticipant) => (
                  <div
                    key={participant.exportName}
                    className="rounded-md border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{participant.exportName}</p>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {t('expenseReferences', {
                          count: participant.expenseCount,
                        })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`email-${participant.exportName}`}>
                        {t('emailLabel')}
                      </Label>
                      <Input
                        id={`email-${participant.exportName}`}
                        type="email"
                        placeholder={t('emailPlaceholder')}
                        value={memberEmails[participant.exportName] ?? ''}
                        onChange={(event) =>
                          setMemberEmails((current) => ({
                            ...current,
                            [participant.exportName]: event.target.value,
                          }))
                        }
                        disabled={isBusy}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('softCreateHint')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fileContent && !isAnalyzing && (
            <div className="space-y-2">
              <Label>{t('previewLabel')}</Label>
              <div className="p-3 bg-muted rounded-md text-sm font-mono overflow-auto max-h-32">
                {previewLines.map((line, index) => (
                  <div key={index} className="break-all whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
                {fileContent.split('\n').length > 10 && (
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
              disabled={!fileContent || isBusy || isAnalyzing}
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
                  {hasMissingParticipants ? t('addAndImport') : t('import')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
