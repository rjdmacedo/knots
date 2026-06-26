import type { getGroupExpenses } from '@/lib/api'
import { getReimbursements } from '@/lib/balances'
import { getPairwiseBalance } from '@/lib/friend-balances'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimelineGroupSummary = {
  type: 'GROUP_SUMMARY'
  groupId: string
  groupName: string
  activityDate: Date // max expenseDate of shared expenses in this group
  balanceAmount: number // minor units; pairwise (positive = friend owes you)
  currency: string
  isSettled: boolean
}

export type TimelineExpense = {
  type: 'EXPENSE'
  expenseId: string
  title: string
  expenseDate: Date
  amount: number // total cost in minor units
  currency: string
  paidById: string
  paidByName: string
  userShare: number // from current user POV: positive = lent, negative = borrowed
  participantCount: number // 2+ (can be multi-participant)
}

export type TimelinePayment = {
  type: 'PAYMENT'
  expenseId: string
  groupId: string | null // null = direct payment
  groupName: string | null
  expenseDate: Date
  amount: number
  currency: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  creationMethod: 'PAYMENT' | 'DEBT_CONSOLIDATION' | null
  bundleId: string | null
}

export type TimelineEntry =
  | TimelineGroupSummary
  | TimelineExpense
  | TimelinePayment

// ─── Input types ─────────────────────────────────────────────────────────────

type ExpenseRecord = NonNullable<
  Awaited<ReturnType<typeof getGroupExpenses>>
>[number]

export type SharedGroupInput = {
  id: string
  name: string
  currency: string
  simplifyDebts: boolean
  expenses: ExpenseRecord[]
}

export type DirectExpenseInput = {
  expense: ExpenseRecord
  currency: string
  creationMethod?: 'PAYMENT' | 'DEBT_CONSOLIDATION' | null
  bundleId?: string | null
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/** Internal wrapper to carry createdAt for tie-break sorting. */
type SortableEntry = {
  entry: TimelineEntry
  createdAt: Date | null
}

/**
 * Builds a unified friend timeline from shared groups, direct expenses, and payments.
 *
 * Pure computation module — no DB queries. Data is fetched by the tRPC procedure
 * and passed in here.
 *
 * Algorithm:
 * 1. For each shared group → emit GROUP_SUMMARY (pairwise balance, last activity date)
 * 2. For each direct expense (groupId=null, isReimbursement=false) → emit EXPENSE
 * 3. For each payment (isReimbursement=true) across ALL contexts → emit PAYMENT
 * 4. Sort by date desc, tie-break by createdAt desc
 */
export function buildFriendTimeline(params: {
  currentUserId: string
  friendUserId: string
  sharedGroups: SharedGroupInput[]
  directExpenses: DirectExpenseInput[]
  payments: Array<{
    expense: ExpenseRecord
    groupId: string | null
    groupName: string | null
    currency: string
    creationMethod?: 'PAYMENT' | 'DEBT_CONSOLIDATION' | null
    bundleId?: string | null
  }>
}): TimelineEntry[] {
  const {
    currentUserId,
    friendUserId,
    sharedGroups,
    directExpenses,
    payments,
  } = params

  const sortable: SortableEntry[] = []

  // 1. GROUP_SUMMARY entries
  for (const group of sharedGroups) {
    const summary = buildGroupSummary(group, currentUserId, friendUserId)
    if (summary) {
      sortable.push({ entry: summary, createdAt: null })
    }
  }

  // 2. EXPENSE entries (direct, non-reimbursement)
  for (const { expense, currency } of directExpenses) {
    const entry = buildExpenseEntry(expense, currency, currentUserId)
    if (entry) {
      sortable.push({ entry, createdAt: expense.createdAt })
    }
  }

  // 3. PAYMENT entries (all reimbursements involving both users)
  for (const payment of payments) {
    const entry = buildPaymentEntry(payment, currentUserId, friendUserId)
    if (entry) {
      sortable.push({ entry, createdAt: payment.expense.createdAt })
    }
  }

  // 4. Sort by date descending, tie-break by createdAt descending
  sortable.sort((a, b) => {
    const dateA = getEntryDate(a.entry)
    const dateB = getEntryDate(b.entry)
    const dateDiff = dateB.getTime() - dateA.getTime()
    if (dateDiff !== 0) return dateDiff

    // Tie-break by createdAt
    if (a.createdAt && b.createdAt) {
      return b.createdAt.getTime() - a.createdAt.getTime()
    }
    // Entries with createdAt come before those without (GROUP_SUMMARY)
    if (a.createdAt && !b.createdAt) return -1
    if (!a.createdAt && b.createdAt) return 1
    return 0
  })

  return sortable.map((s) => s.entry)
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildGroupSummary(
  group: SharedGroupInput,
  currentUserId: string,
  friendUserId: string,
): TimelineGroupSummary | null {
  const { expenses } = group

  // activityDate = max expenseDate among expenses involving both users in that group
  const relevantExpenses = expenses.filter(
    (e) => involvesUser(e, currentUserId) && involvesUser(e, friendUserId),
  )

  const activityDate = getMaxExpenseDate(relevantExpenses)
  if (!activityDate) {
    // No shared expenses in this group — still emit as settled
    return {
      type: 'GROUP_SUMMARY',
      groupId: group.id,
      groupName: group.name,
      activityDate: new Date(0), // epoch fallback
      balanceAmount: 0,
      currency: group.currency,
      isSettled: true,
    }
  }

  // Compute pairwise balance using the reimbursement engine
  const reimbursements = getReimbursements(expenses, {
    simplifyDebts: group.simplifyDebts,
  })
  const balanceAmount = getPairwiseBalance(
    reimbursements,
    currentUserId,
    friendUserId,
  )

  return {
    type: 'GROUP_SUMMARY',
    groupId: group.id,
    groupName: group.name,
    activityDate,
    balanceAmount,
    currency: group.currency,
    isSettled: balanceAmount === 0,
  }
}

function buildExpenseEntry(
  expense: ExpenseRecord,
  currency: string,
  currentUserId: string,
): TimelineExpense | null {
  // Calculate userShare: what the current user lent or borrowed
  // If current user paid → userShare = totalAmount - their share (positive = lent)
  // If someone else paid → userShare = -(their share) (negative = borrowed)
  const userShare = computeUserShare(expense, currentUserId)

  return {
    type: 'EXPENSE',
    expenseId: expense.id,
    title: expense.title,
    expenseDate: expense.expenseDate,
    amount: expense.amount,
    currency,
    paidById: expense.paidBy.id,
    paidByName: expense.paidBy.name ?? '',
    userShare,
    participantCount: expense.paidFor.length,
  }
}

function buildPaymentEntry(
  payment: {
    expense: ExpenseRecord
    groupId: string | null
    groupName: string | null
    currency: string
    creationMethod?: 'PAYMENT' | 'DEBT_CONSOLIDATION' | null
    bundleId?: string | null
  },
  currentUserId: string,
  friendUserId: string,
): TimelinePayment | null {
  const { expense } = payment

  // For a payment (isReimbursement=true):
  // paidBy = the person who made the payment (from)
  // The payee (to) is the person in paidFor
  const fromUserId = expense.paidBy.id
  const fromUserName = expense.paidBy.name ?? ''

  // The payee is the user in paidFor who isn't the payer
  // (for a 2-person payment, there's typically 1 entry in paidFor — the recipient)
  const toEntry = expense.paidFor.find((pf) => pf.user.id !== fromUserId)
  const toUserId = toEntry?.user.id ?? ''
  const toUserName = toEntry?.user.name ?? ''

  // Verify this payment involves both users
  const involvesCurrent =
    fromUserId === currentUserId || toUserId === currentUserId
  const involvesFriend =
    fromUserId === friendUserId || toUserId === friendUserId
  if (!involvesCurrent || !involvesFriend) {
    return null
  }

  return {
    type: 'PAYMENT',
    expenseId: expense.id,
    groupId: payment.groupId,
    groupName: payment.groupName,
    expenseDate: expense.expenseDate,
    amount: expense.amount,
    currency: payment.currency,
    fromUserId,
    fromUserName,
    toUserId,
    toUserName,
    creationMethod: payment.creationMethod ?? null,
    bundleId: payment.bundleId ?? null,
  }
}

/**
 * Compute what the current user lent or borrowed in a direct expense.
 *
 * If current user paid:
 *   userShare = totalAmount - currentUser's share (positive = they lent money)
 *
 * If someone else paid:
 *   userShare = -(currentUser's share) (negative = they borrowed)
 */
function computeUserShare(
  expense: ExpenseRecord,
  currentUserId: string,
): number {
  const paidFors = expense.paidFor
  const totalShares = paidFors.reduce((sum, pf) => sum + pf.shares, 0)

  // Find current user's participation
  const currentUserPaidFor = paidFors.find((pf) => pf.user.id === currentUserId)

  if (!currentUserPaidFor) {
    // User is not a participant but paid — they lent the full amount
    if (expense.paidBy.id === currentUserId) {
      return expense.amount
    }
    return 0
  }

  // Calculate current user's share of the cost
  let currentUserShareAmount: number

  switch (expense.splitMode) {
    case 'EVENLY':
      currentUserShareAmount = expense.amount / paidFors.length
      break
    case 'BY_AMOUNT':
      currentUserShareAmount = currentUserPaidFor.shares
      break
    case 'BY_PERCENTAGE':
      currentUserShareAmount =
        (expense.amount * currentUserPaidFor.shares) / 10000
      break
    case 'BY_SHARES':
      currentUserShareAmount =
        (expense.amount * currentUserPaidFor.shares) / totalShares
      break
    default:
      currentUserShareAmount = 0
  }

  currentUserShareAmount = Math.round(currentUserShareAmount)

  if (expense.paidBy.id === currentUserId) {
    // Current user paid → they lent (total - their share)
    return expense.amount - currentUserShareAmount
  } else {
    // Someone else paid → current user borrowed their share
    return -currentUserShareAmount
  }
}

/** Check if a user is involved in an expense (as payer or participant). */
function involvesUser(expense: ExpenseRecord, userId: string): boolean {
  if (expense.paidBy.id === userId) return true
  return expense.paidFor.some((pf) => pf.user.id === userId)
}

/** Get the maximum expenseDate from a list of expenses. */
function getMaxExpenseDate(expenses: ExpenseRecord[]): Date | null {
  if (expenses.length === 0) return null

  let max = expenses[0].expenseDate
  for (let i = 1; i < expenses.length; i++) {
    if (expenses[i].expenseDate > max) {
      max = expenses[i].expenseDate
    }
  }
  return max
}

/** Extract the relevant date from a timeline entry for sorting. */
function getEntryDate(entry: TimelineEntry): Date {
  switch (entry.type) {
    case 'GROUP_SUMMARY':
      return entry.activityDate
    case 'EXPENSE':
      return entry.expenseDate
    case 'PAYMENT':
      return entry.expenseDate
  }
}
