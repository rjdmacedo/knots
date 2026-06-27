'use client'

import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { ExpenseImport } from '@/components/expense-import'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
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
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
          <CardAction className="flex flex-row gap-2">
            <ExportButton groupId={groupId} />
            <ExpenseImport groupId={groupId} />
            {enableReceiptExtract && <CreateFromReceiptButton />}
          </CardAction>
        </CardHeader>

        <CardContent className="p-0 pt-2 pb-4 sm:pb-6 flex flex-col relative">
          <ExpenseList />
        </CardContent>
      </Card>
    </>
  )
}
