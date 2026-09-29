'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import type { Locale } from '@/i18n'
import type { Currency } from '@/lib/currency'
import type { DuplicateCheckResult } from '@/lib/duplicate-expense-detection'
import { computeSimilarityIndicators } from '@/lib/duplicate-expense-detection'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useTranslations } from 'next-intl'

type DuplicateExpenseDialogProps = {
  open: boolean
  matches: DuplicateCheckResult['matches']
  newExpense: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
  }
  onConfirm: () => void
  onCancel: () => void
  onMatchClick?: (matchId: string) => void
  currency: Currency
  locale: Locale
}

export function DuplicateExpenseDialog({
  open,
  matches,
  newExpense,
  onConfirm,
  onCancel,
  currency,
  locale,
}: DuplicateExpenseDialogProps) {
  const t = useTranslations('DuplicateExpense')

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-4 data-[size=default]:max-w-[calc(100%-2rem)] sm:max-w-lg! sm:gap-6 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {matches.map((match) => {
            const indicators = computeSimilarityIndicators(newExpense, match)
            const titleMatches = indicators.includes('similar-title')
            const amountMatches = indicators.includes('same-amount')
            const dateMatches = indicators.includes('close-in-date')
            const warningClass =
              'text-orange-600 dark:text-orange-400 font-medium'
            const labelClass =
              'w-24 whitespace-nowrap px-2 py-2 align-middle text-muted-foreground sm:px-3'
            const valueClass =
              'px-2 py-2 align-middle whitespace-nowrap sm:px-3'
            const titleClass = 'max-w-0 truncate px-2 py-2 align-middle sm:px-3'
            const yoursTitle = newExpense.title || '—'

            return (
              <div
                key={match.id}
                className="w-full overflow-hidden rounded-md border text-sm"
              >
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className={labelClass} />
                      <th
                        className={`${valueClass} text-left font-medium text-muted-foreground`}
                      >
                        {t('yours')}
                      </th>
                      <th
                        className={`${valueClass} text-left font-medium text-muted-foreground`}
                      >
                        {t('existing')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className={labelClass}>{t('fields.title')}</td>
                      <td
                        className={`${titleClass} ${titleMatches ? warningClass : ''}`}
                        title={yoursTitle}
                      >
                        {yoursTitle}
                      </td>
                      <td
                        className={`${titleClass} ${titleMatches ? warningClass : ''}`}
                        title={match.title}
                      >
                        {match.title}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className={labelClass}>{t('fields.amount')}</td>
                      <td
                        className={`${valueClass} ${amountMatches ? warningClass : ''}`}
                      >
                        {formatCurrency(currency, newExpense.amount, locale)}
                      </td>
                      <td
                        className={`${valueClass} ${amountMatches ? warningClass : ''}`}
                      >
                        {formatCurrency(currency, match.amount, locale)}
                      </td>
                    </tr>
                    <tr>
                      <td className={labelClass}>{t('fields.date')}</td>
                      <td
                        className={`${valueClass} ${dateMatches ? warningClass : ''}`}
                      >
                        {formatDate(newExpense.expenseDate, locale, {
                          dateStyle: 'medium',
                        })}
                      </td>
                      <td
                        className={`${valueClass} ${dateMatches ? warningClass : ''}`}
                      >
                        {formatDate(match.expenseDate, locale, {
                          dateStyle: 'medium',
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {indicators.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-3 py-2 border-t">
                    {indicators.map((indicator) => (
                      <Badge key={indicator} variant="secondary">
                        {t(`indicators.${indicator}`)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t('cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
