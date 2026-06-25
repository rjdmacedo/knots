'use client'

import { CreateFromReceiptButton } from '@/app/groups/[groupSlug]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupSlug]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupSlug]/export-button'
import { ExpenseImport } from '@/components/expense-import'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Plus } from 'lucide-react'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Expenses',
}

export default function GroupExpensesPageClient({
  enableReceiptExtract,
}: {
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Expenses')
  const { groupId, groupSlug } = useCurrentGroup()

  return (
    <>
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
          <CardAction className="flex flex-row gap-2">
            <ExportButton groupId={groupId} groupSlug={groupSlug} />
            <ExpenseImport groupId={groupId} />
            {enableReceiptExtract && <CreateFromReceiptButton />}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/groups/${groupSlug}/expenses/create`}
                    className={buttonVariants({ size: 'icon' })}
                  />
                }
              >
                <Plus className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent>{t('create')}</TooltipContent>
            </Tooltip>
          </CardAction>
        </CardHeader>

        <CardContent className="p-0 pt-2 pb-4 sm:pb-6 flex flex-col relative">
          <ExpenseList />
        </CardContent>
      </Card>
    </>
  )
}
