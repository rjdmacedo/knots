'use client'

import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
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
  const { groupId } = useCurrentGroup()

  return (
    <>
      <Card className="rounded-none -mx-4 border-x-0 sm:border-x sm:rounded-lg sm:mx-0">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
          <CardAction className="flex flex-row gap-2">
            <ExportButton groupId={groupId} />
            <ExpenseImport groupId={groupId} />
            {enableReceiptExtract && <CreateFromReceiptButton />}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/groups/${groupId}/expenses/create`}
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
