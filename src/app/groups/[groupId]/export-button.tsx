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
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon">
              <Download className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('export')}</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link
            prefetch={false}
            href={`/groups/${groupId}/expenses/export/json`}
            target="_blank"
          >
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4" />
              <p>{t('exportJson')}</p>
            </div>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            prefetch={false}
            href={`/groups/${groupId}/expenses/export/csv`}
            target="_blank"
          >
            <div className="flex items-center gap-2">
              <FileDown className="w-4 h-4" />
              <p>{t('exportCsv')}</p>
            </div>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
