import { Currency } from '@/lib/currency'
import { calculateShare } from '@/lib/totals'
import { formatCurrency } from '@/lib/utils'
import { SplitMode } from '@prisma/client'

type SplitExpense = {
  amount: number
  isReimbursement: boolean
  splitMode: SplitMode
  paidBy: { id: string; name?: string | null; email?: string | null }
  paidFor: Array<{
    user: { id: string; name: string | null; email?: string | null }
    shares: number
  }>
}

export type SplitLine = {
  userId: string
  name: string
  amount: number
  isCurrentUser: boolean
  isPayer: boolean
}

export function getParticipantShareAmount(
  expense: SplitExpense,
  userId: string,
): number {
  if (expense.isReimbursement) {
    const paidFor = expense.paidFor.find((entry) => entry.user.id === userId)
    if (!paidFor) return 0
    return expense.splitMode === 'BY_AMOUNT'
      ? Number(paidFor.shares)
      : expense.amount
  }

  return calculateShare(userId, expense as Parameters<typeof calculateShare>[1])
}

export function buildExpenseSplitLines(
  expense: SplitExpense,
  currentUserId: string | undefined,
): SplitLine[] {
  return expense.paidFor
    .map((entry) => ({
      userId: entry.user.id,
      name: entry.user.name ?? entry.user.email ?? '',
      amount: getParticipantShareAmount(expense, entry.user.id),
      isCurrentUser: entry.user.id === currentUserId,
      isPayer: entry.user.id === expense.paidBy.id,
    }))
    .filter((line) => line.amount > 0)
}

export type SplitLineMessageKey =
  | 'yourShare'
  | 'participantShare'
  | 'youOwe'
  | 'participantOwes'

export function getSplitLineMessageKey(line: SplitLine): SplitLineMessageKey {
  if (line.isPayer) {
    return line.isCurrentUser ? 'yourShare' : 'participantShare'
  }
  return line.isCurrentUser ? 'youOwe' : 'participantOwes'
}

export function formatSplitAmount(
  currency: Currency,
  amount: number,
  locale: string,
) {
  return formatCurrency(currency, amount, locale)
}

export type PaymentParties = {
  payerId: string
  payerName: string
  payeeId: string
  payeeName: string
}

/** Resolve payer and payee for a reimbursement (payment) expense. */
export function getPaymentParties(
  expense: SplitExpense,
): PaymentParties | null {
  if (!expense.isReimbursement) return null

  const payeeEntry =
    expense.paidFor.find((entry) => entry.user.id !== expense.paidBy.id) ??
    expense.paidFor[0]

  if (!payeeEntry) return null

  return {
    payerId: expense.paidBy.id,
    payerName: expense.paidBy.name ?? payeeEntry.user.email ?? '',
    payeeId: payeeEntry.user.id,
    payeeName: payeeEntry.user.name ?? payeeEntry.user.email ?? '',
  }
}

export type PaymentDisplayVariant = 'paidYou' | 'youPaid' | 'payerPaidPayee'

export function getPaymentDisplayVariant(
  parties: PaymentParties,
  currentUserId: string | undefined,
): PaymentDisplayVariant {
  if (currentUserId === parties.payeeId) return 'paidYou'
  if (currentUserId === parties.payerId) return 'youPaid'
  return 'payerPaidPayee'
}
