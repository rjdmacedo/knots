'use client'

import { KnotsImportDialog } from '@/components/knots-import-dialog'
import { SplitwiseImportDialog } from '@/components/splitwise-import-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FileDown, FileJson, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

interface ExpenseImportProps {
  groupId: string
  onImportComplete?: () => void
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
