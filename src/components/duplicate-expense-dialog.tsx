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
import {
  computeSimilarityIndicators,
  type SimilarityIndicator,
} from '@/lib/duplicate-expense-detection'
import { formatCurrency, formatDate } from '@/lib/utils'

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
  onMatchClick: (matchId: string) => void
  currency: Currency
  locale: Locale
}

const indicatorLabels: Record<SimilarityIndicator, string> = {
  'similar-title': 'Similar title',
  'same-amount': 'Same amount',
  'close-in-date': 'Close in date',
  'same-category': 'Same category',
}

export function DuplicateExpenseDialog({
  open,
  matches,
  newExpense,
  onConfirm,
  onCancel,
  onMatchClick,
  currency,
  locale,
}: DuplicateExpenseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Potential duplicate detected</AlertDialogTitle>
          <AlertDialogDescription>
            The expense you are saving looks similar to an existing one. Compare
            below and decide whether to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {matches.map((match) => {
            const indicators = computeSimilarityIndicators(newExpense, match)
            const titleMatches = indicators.includes('similar-title')
            const amountMatches = indicators.includes('same-amount')
            const dateMatches = indicators.includes('close-in-date')
            const warningClass =
              'text-orange-600 dark:text-orange-400 font-medium'

            return (
              <button
                key={match.id}
                type="button"
                className="w-full rounded-md border text-left text-sm hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden"
                onClick={() => onMatchClick(match.id)}
              >
                {/* Comparison table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-[80px]" />
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Yours
                      </th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                        Existing
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Title row */}
                    <tr className="border-b">
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Title
                      </td>
                      <td
                        className={`px-3 py-1.5 ${titleMatches ? warningClass : ''}`}
                      >
                        {newExpense.title || '—'}
                      </td>
                      <td
                        className={`px-3 py-1.5 ${titleMatches ? warningClass : ''}`}
                      >
                        {match.title}
                      </td>
                    </tr>
                    {/* Amount row */}
                    <tr className="border-b">
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Amount
                      </td>
                      <td
                        className={`px-3 py-1.5 ${amountMatches ? warningClass : ''}`}
                      >
                        {formatCurrency(currency, newExpense.amount, locale)}
                      </td>
                      <td
                        className={`px-3 py-1.5 ${amountMatches ? warningClass : ''}`}
                      >
                        {formatCurrency(currency, match.amount, locale)}
                      </td>
                    </tr>
                    {/* Date row */}
                    <tr>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        Date
                      </td>
                      <td
                        className={`px-3 py-1.5 ${dateMatches ? warningClass : ''}`}
                      >
                        {formatDate(newExpense.expenseDate, locale, {
                          dateStyle: 'medium',
                        })}
                      </td>
                      <td
                        className={`px-3 py-1.5 ${dateMatches ? warningClass : ''}`}
                      >
                        {formatDate(match.expenseDate, locale, {
                          dateStyle: 'medium',
                        })}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Similarity badges */}
                {indicators.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-3 py-2 border-t">
                    {indicators.map((indicator) => (
                      <Badge key={indicator} variant="secondary">
                        {indicatorLabels[indicator]}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Save anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
