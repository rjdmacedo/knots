'use client'

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
import { Download, FileDown, FileJson } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function ExportButton({ groupId }: { groupId: string }) {
  const t = useTranslations('Expenses')
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="secondary" size="icon" />}
            />
          }
        >
          <Download className="w-4 h-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('export')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuItem
          render={
            <Link
              prefetch={false}
              href={`/groups/${groupId}/expenses/export/json`}
              target="_blank"
            />
          }
        >
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            <p>{t('exportJson')}</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link
              prefetch={false}
              href={`/groups/${groupId}/expenses/export/csv`}
              target="_blank"
            />
          }
        >
          <div className="flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            <p>{t('exportCsv')}</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
