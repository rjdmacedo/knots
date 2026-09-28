import { getSuggestedReimbursements } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { getDecimalDigits } from '@/lib/currency-conversion'
import { formatAmountAsDecimal, getCurrencyFromGroup } from '@/lib/utils'
import { Parser } from '@json2csv/plainjs'
import { SplitMode } from '@prisma/client'

export const splitModeLabel: Record<SplitMode, string> = {
  EVENLY: 'Evenly',
  BY_SHARES: 'Unevenly – By shares',
  BY_PERCENTAGE: 'Unevenly – By percentage',
  BY_AMOUNT: 'Unevenly – By amount',
}

export const CSV_STANDARD_FIELDS = [
  { label: 'Date', value: 'date' },
  { label: 'Description', value: 'title' },
  { label: 'Category', value: 'categoryName' },
  { label: 'Currency', value: 'currency' },
  { label: 'Cost', value: 'amount' },
  { label: 'Paid by', value: 'paidBy' },
  { label: 'Split with', value: 'splitWith' },
  { label: 'Split mode', value: 'splitMode' },
  { label: 'Original cost', value: 'originalAmount' },
  { label: 'Original currency', value: 'originalCurrency' },
  { label: 'Conversion rate', value: 'conversionRate' },
  { label: 'Is Reimbursement', value: 'isReimbursement' },
]

export function formatDate(isoDate: Date | string): string {
  const date = new Date(isoDate)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type ExportParticipant = {
  id: string
  name: string
}

export type ExportExpense = {
  expenseDate: Date | string
  title: string
  category?: { name: string } | null
  amount: number
  originalAmount?: number | null
  originalCurrency?: string | null
  conversionRate?: { toString(): string } | number | string | null
  paidById: string
  paidBy?: { id: string; name: string } | null
  paidFor: Array<{
    userId: string
    shares: number
    user?: { id: string; name: string }
  }>
  payers: Array<{
    userId: string
    amount: number
    user?: { id: string; name: string }
  }>
  isReimbursement: boolean
  splitMode: SplitMode
}

/**
 * Calculates a participant's net position for a single expense:
 * net = amount paid (credit) - share consumed (debit).
 *
 * Positive value = the participant is owed money (credit).
 * Negative value = the participant owes money (debt).
 * Zero = participant is even or not involved.
 */
export function computeParticipantNet(
  participantId: string,
  expense: Pick<
    ExportExpense,
    | 'amount'
    | 'paidById'
    | 'payers'
    | 'paidFor'
    | 'isReimbursement'
    | 'splitMode'
  >,
  currency: Currency,
): number {
  // 1. Credit: How much did this participant pay towards the expense?
  let credit = 0
  if (expense.payers && expense.payers.length > 0) {
    const payer = expense.payers.find((p) => p.userId === participantId)
    if (payer) {
      credit = payer.amount
    }
  } else if (expense.paidById === participantId) {
    credit = expense.amount
  }

  // 2. Debit: What was this participant's share of the expense?
  let debit = 0
  if (expense.isReimbursement) {
    const isBeneficiary = expense.paidFor.some(
      (pf) => pf.userId === participantId,
    )
    if (isBeneficiary) {
      debit = expense.amount
    }
  } else {
    const totalShares = expense.paidFor.reduce((sum, pf) => sum + pf.shares, 0)
    const pfEntry = expense.paidFor.find((pf) => pf.userId === participantId)
    const participantShare = pfEntry ? pfEntry.shares : 0

    if (totalShares > 0 && participantShare > 0) {
      if (expense.splitMode === 'BY_AMOUNT') {
        debit = participantShare
      } else if (expense.splitMode === 'BY_PERCENTAGE') {
        debit = (expense.amount * participantShare) / (totalShares || 10000)
      } else {
        debit = (expense.amount / totalShares) * participantShare
      }
    }
  }

  const net = credit - debit
  return +formatAmountAsDecimal(net, currency) + 0
}

/**
 * Formats the "Paid by" column cleanly.
 * Single payer: "Rafael"
 * Multiple payers: "Rafael (60.00), Alice (40.00)"
 */
export function formatPaidBy(
  expense: Pick<ExportExpense, 'amount' | 'paidById' | 'paidBy' | 'payers'>,
  currency: Currency,
  participantMap: Map<string, string>,
): string {
  if (expense.payers && expense.payers.length > 1) {
    return expense.payers
      .map((p) => {
        const name = p.user?.name ?? participantMap.get(p.userId) ?? p.userId
        const formattedAmount = formatAmountAsDecimal(p.amount, currency)
        return `${name} (${formattedAmount})`
      })
      .join(', ')
  }

  if (expense.payers && expense.payers.length === 1) {
    const p = expense.payers[0]
    return p.user?.name ?? participantMap.get(p.userId) ?? p.userId
  }

  return (
    expense.paidBy?.name ??
    participantMap.get(expense.paidById) ??
    expense.paidById
  )
}

/**
 * Formats the "Split with" column.
 * If all group members are included, returns "All".
 * Otherwise, returns comma-separated list of beneficiary names.
 */
export function formatSplitWith(
  expense: Pick<ExportExpense, 'paidFor'>,
  participants: ExportParticipant[],
  participantMap: Map<string, string>,
): string {
  if (
    participants.length > 0 &&
    expense.paidFor.length === participants.length &&
    participants.every((p) => expense.paidFor.some((pf) => pf.userId === p.id))
  ) {
    return 'All'
  }

  const names = expense.paidFor
    .map((pf) => pf.user?.name ?? participantMap.get(pf.userId))
    .filter((name): name is string => Boolean(name))

  return names.length > 0 ? names.join(', ') : 'None'
}

/**
 * Builds the CSV fields definition for @json2csv/plainjs
 */
export function buildCsvFields(participants: ExportParticipant[]) {
  return [
    ...CSV_STANDARD_FIELDS,
    ...participants.map((participant) => ({
      label: participant.name,
      value: participant.name,
    })),
  ]
}

/**
 * Builds the array of rows to be converted to CSV, including:
 * 1. Detailed expense rows (with net positions per participant).
 * 2. "TOTAL BALANCE" row showing group spending and overall net balance per participant.
 * 3. "SETTLEMENT" rows showing simplified debt payoff instructions (who pays whom).
 */
export function buildCsvRows(
  group: { currency: string; currencyCode: string | null },
  participants: ExportParticipant[],
  expenses: ExportExpense[],
) {
  const currency = getCurrencyFromGroup(group)
  const currencyCode = group.currencyCode ?? group.currency
  const participantMap = new Map(participants.map((p) => [p.id, p.name]))

  // Track overall participant balances in minor units
  const participantBalances: Record<string, { total: number }> = {}
  for (const p of participants) {
    participantBalances[p.id] = { total: 0 }
  }

  // 1. Format expense rows
  const expenseRows = expenses.map((expense) => {
    const row: Record<string, any> = {
      date: formatDate(expense.expenseDate),
      title: expense.title,
      categoryName: expense.category?.name || '',
      currency: currencyCode,
      amount: formatAmountAsDecimal(expense.amount, currency),
      paidBy: formatPaidBy(expense, currency, participantMap),
      splitWith: formatSplitWith(expense, participants, participantMap),
      splitMode: splitModeLabel[expense.splitMode] ?? expense.splitMode,
      originalAmount:
        expense.originalAmount != null && expense.originalCurrency
          ? (
              expense.originalAmount /
              Math.pow(10, getDecimalDigits(expense.originalCurrency))
            ).toFixed(getDecimalDigits(expense.originalCurrency))
          : '',
      originalCurrency: expense.originalCurrency ?? '',
      conversionRate: expense.conversionRate
        ? expense.conversionRate.toString()
        : '',
      isReimbursement: expense.isReimbursement ? 'Yes' : 'No',
    }

    // Compute net balance per participant for this expense row
    for (const participant of participants) {
      const net = computeParticipantNet(participant.id, expense, currency)
      row[participant.name] = net

      // Accumulate raw unrounded credit and debit in minor units
      let rawCredit = 0
      if (expense.payers && expense.payers.length > 0) {
        const payer = expense.payers.find((p) => p.userId === participant.id)
        if (payer) rawCredit = payer.amount
      } else if (expense.paidById === participant.id) {
        rawCredit = expense.amount
      }

      let rawDebit = 0
      if (expense.isReimbursement) {
        if (expense.paidFor.some((pf) => pf.userId === participant.id)) {
          rawDebit = expense.amount
        }
      } else {
        const totalShares = expense.paidFor.reduce(
          (sum, pf) => sum + pf.shares,
          0,
        )
        const pfEntry = expense.paidFor.find(
          (pf) => pf.userId === participant.id,
        )
        const participantShare = pfEntry ? pfEntry.shares : 0

        if (totalShares > 0 && participantShare > 0) {
          if (expense.splitMode === 'BY_AMOUNT') {
            rawDebit = participantShare
          } else if (expense.splitMode === 'BY_PERCENTAGE') {
            rawDebit =
              (expense.amount * participantShare) / (totalShares || 10000)
          } else {
            rawDebit = (expense.amount / totalShares) * participantShare
          }
        }
      }

      participantBalances[participant.id].total += rawCredit - rawDebit
    }

    return row
  })

  // If there are no expenses, return empty rows
  if (expenses.length === 0) {
    return []
  }

  // 2. Summary row: TOTAL BALANCE
  const totalSpending = expenses.reduce(
    (sum, e) => (e.isReimbursement ? sum : sum + e.amount),
    0,
  )

  const totalBalanceRow: Record<string, any> = {
    date: '',
    title: 'TOTAL BALANCE',
    categoryName: '',
    currency: currencyCode,
    amount: formatAmountAsDecimal(totalSpending, currency),
    paidBy: '',
    splitWith: '',
    splitMode: '',
    originalAmount: '',
    originalCurrency: '',
    conversionRate: '',
    isReimbursement: '',
  }

  for (const p of participants) {
    const totalNet = participantBalances[p.id]?.total ?? 0
    totalBalanceRow[p.name] = +formatAmountAsDecimal(totalNet, currency) + 0
  }

  // 3. Final Settlement rows (using Knots suggested reimbursements)
  const balancesForSettlement = Object.fromEntries(
    participants.map((p) => [
      p.id,
      {
        paid: 0,
        paidFor: 0,
        total: Math.round(participantBalances[p.id]?.total ?? 0) + 0,
      },
    ]),
  )

  const suggestedReimbursements = getSuggestedReimbursements(
    balancesForSettlement,
  )

  const settlementRows = suggestedReimbursements.map((reimbursement) => {
    const fromName =
      participantMap.get(reimbursement.from) ?? reimbursement.from
    const toName = participantMap.get(reimbursement.to) ?? reimbursement.to
    const amountFormatted = formatAmountAsDecimal(
      reimbursement.amount,
      currency,
    )

    const row: Record<string, any> = {
      date: '',
      title: `Settlement: ${fromName} -> ${toName}`,
      categoryName: 'Settlement',
      currency: currencyCode,
      amount: amountFormatted,
      paidBy: fromName,
      splitWith: toName,
      splitMode: 'Settlement',
      originalAmount: '',
      originalCurrency: '',
      conversionRate: '',
      isReimbursement: 'Yes',
    }

    for (const p of participants) {
      row[p.name] = ''
    }

    return row
  })

  return [...expenseRows, totalBalanceRow, ...settlementRows]
}

/**
 * Generates the full CSV string from group data.
 */
export function generateGroupExpensesCsv(
  group: { currency: string; currencyCode: string | null },
  participants: ExportParticipant[],
  expenses: ExportExpense[],
): string {
  const fields = buildCsvFields(participants)
  const rows = buildCsvRows(group, participants, expenses)
  const parser = new Parser({ fields })
  return parser.parse(rows)
}
