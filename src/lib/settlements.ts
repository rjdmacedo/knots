import { getGroup, getGroupExpenses } from '@/lib/api'
import { getReimbursements, type Reimbursement } from '@/lib/balances'
import type { Currency } from '@/lib/currency'
import type { ExpenseFormValues } from '@/lib/schemas'
import { formatCurrency } from '@/lib/utils'
import { RecurrenceRule } from '@prisma/client'

const PAYMENT_CATEGORY_ID = 1

export function findDebtBetween(
  reimbursements: Reimbursement[],
  fromUserId: string,
  toUserId: string,
): Reimbursement | undefined {
  return reimbursements.find((r) => r.from === fromUserId && r.to === toUserId)
}

export function findMatchingReimbursement(
  reimbursements: Reimbursement[],
  fromUserId: string,
  toUserId: string,
  amount: number,
): Reimbursement | undefined {
  const debt = findDebtBetween(reimbursements, fromUserId, toUserId)
  if (!debt) return undefined
  return Math.round(debt.amount) === Math.round(amount) ? debt : undefined
}

export type SettlementBalanceStatus =
  | { kind: 'settled' }
  | { kind: 'payer_owes_creditor'; amount: number }
  | { kind: 'creditor_owes_payer'; amount: number }

export function getSettlementBalanceStatus(
  reimbursements: Reimbursement[],
  payerUserId: string,
  creditorUserId: string,
): SettlementBalanceStatus {
  const payerOwes = findDebtBetween(reimbursements, payerUserId, creditorUserId)
  if (payerOwes) {
    return { kind: 'payer_owes_creditor', amount: payerOwes.amount }
  }

  const creditorOwes = findDebtBetween(
    reimbursements,
    creditorUserId,
    payerUserId,
  )
  if (creditorOwes) {
    return { kind: 'creditor_owes_payer', amount: creditorOwes.amount }
  }

  return { kind: 'settled' }
}

export function formatSettlementBalanceStatusForCreditor(
  status: SettlementBalanceStatus,
  payerName: string,
  currency: Currency,
  locale = 'en-US',
): string {
  switch (status.kind) {
    case 'settled':
      return 'All settled'
    case 'payer_owes_creditor':
      return `${payerName} still owes you ${formatCurrency(currency, status.amount, locale)}`
    case 'creditor_owes_payer':
      return `You owe ${payerName} ${formatCurrency(currency, status.amount, locale)}`
  }
}

export async function getSuggestedReimbursementsForGroup(
  groupId: string,
): Promise<Reimbursement[]> {
  const [group, expenses] = await Promise.all([
    getGroup(groupId),
    getGroupExpenses(groupId),
  ])
  return getReimbursements(expenses, {
    simplifyDebts: group?.simplifyDebts ?? true,
  })
}

export function buildSettlementFormValues(
  amountMinor: number,
  fromUserId: string,
  toUserId: string,
  title: string,
): ExpenseFormValues {
  return {
    expenseDate: new Date(),
    title,
    category: PAYMENT_CATEGORY_ID,
    amount: amountMinor,
    paidBy: fromUserId,
    paidFor: [{ participant: toUserId, shares: amountMinor }],
    splitMode: 'BY_AMOUNT',
    saveDefaultSplittingOptions: false,
    isReimbursement: true,
    documents: [],
    notes: '',
    recurrenceRule: RecurrenceRule.NONE,
  }
}

export function buildSettleBalancesUrl(groupId: string): string {
  const baseUrl = getAppBaseUrl()
  return `${baseUrl}/groups/${groupId}/balances`
}

export function buildFriendBalancesUrl(friendId: string): string {
  const baseUrl = getAppBaseUrl()
  return `${baseUrl}/friends/${friendId}/balances`
}

function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}
