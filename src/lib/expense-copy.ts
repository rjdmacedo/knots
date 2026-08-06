import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'
import type { Currency } from '@/lib/currency'
import { amountAsDecimal } from '@/lib/utils'
import type { SplitMode } from '@prisma/client'

export type CopyableExpense = {
  title: string
  amount: number // minor units (cents)
  categoryId: number | null
  paidById: string
  splitMode: SplitMode
  isReimbursement: boolean
  notes: string | null
  paidFor: Array<{ userId: string; shares: number }>
}

export function buildCopyExpensePrefill(
  expense: CopyableExpense,
  currency: Currency,
): ExpenseFormCreatePrefill {
  const amount = amountAsDecimal(expense.amount, currency)

  return {
    title: expense.title,
    expenseDate: new Date(), // today
    amount,
    category: expense.categoryId ?? 0,
    paidBy: expense.paidById,
    splitMode: expense.splitMode,
    isReimbursement: expense.isReimbursement,
    notes: expense.notes ?? '',
    paidFor: expense.paidFor.map(({ userId, shares }) => {
      // Mirror expense-form edit defaults: EVENLY uses unit shares in the form;
      // DB may store 0 after Int truncation of fractional values.
      if (expense.splitMode === 'EVENLY') {
        return { participant: userId, shares: 1 }
      }
      const shareValue =
        expense.splitMode === 'BY_AMOUNT'
          ? amountAsDecimal(shares, currency)
          : shares / 100
      return {
        participant: userId,
        shares: shareValue <= 0 ? 1 : shareValue,
      }
    }),
    // Explicitly excluded: documents, recurrenceRule
  }
}
