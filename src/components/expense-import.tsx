'use client'

import { KnotsImportDialog } from '@/components/knots-import-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { FileDown, FileJson, Loader2, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface ExpenseImportProps {
  groupId: string
  onImportComplete?: () => void
}

function SplitwiseImportDialog({
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
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()
  const handleImportAbort = useCallback(() => {
    setIsImporting(false)
  }, [])

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
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [open, resetImportCancelled])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error(t('toast.invalidFileType.title'), {
        description: t('toast.invalidFileType.description'),
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setCsvContent(e.target?.result as string)
    }
    reader.readAsText(file)
  }

  const handleClear = () => {
    setCsvContent('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (!csvContent.trim()) {
      toast.error(t('toast.noContent.title'), {
        description: t('toast.noContent.description'),
      })
      return
    }

    try {
      beginImport()
      setIsImporting(true)
      const result = await utils.client.groups.expenses.importSplitwise.mutate(
        { groupId, csvContent },
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
      onOpenChange(false)
      setCsvContent('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-md"
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
            <Label htmlFor="splitwise-import-file">{t('fileLabel')}</Label>
            <div className="flex gap-2">
              <Input
                id="splitwise-import-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                disabled={isImporting}
                className="flex-1"
              />
              {csvContent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleClear}
                      disabled={isImporting}
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

          {csvContent && (
            <div className="space-y-2">
              <Label>{t('previewLabel')}</Label>
              <div className="p-3 bg-muted rounded-md text-sm font-mono overflow-auto max-h-48">
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
            <Button variant="outline" onClick={handleCloseClick}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!csvContent || isImporting}
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

export function ExpenseImport({
  groupId,
  onImportComplete,
}: ExpenseImportProps) {
  const t = useTranslations('ExpenseImport')
  const [knotsOpen, setKnotsOpen] = useState(false)
  const [splitwiseOpen, setSplitwiseOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon">
                <Upload className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('button')}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setKnotsOpen(true)}>
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4" />
              <p>{t('fromKnots')}</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSplitwiseOpen(true)}>
            <div className="flex items-center gap-2">
              <FileDown className="w-4 h-4" />
              <p>{t('fromSplitwise')}</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <KnotsImportDialog
        open={knotsOpen}
        onOpenChange={setKnotsOpen}
        groupId={groupId}
        onImportComplete={onImportComplete}
      />

      <SplitwiseImportDialog
        open={splitwiseOpen}
        onOpenChange={setSplitwiseOpen}
        groupId={groupId}
        onImportComplete={onImportComplete}
      />
    </>
  )
}
