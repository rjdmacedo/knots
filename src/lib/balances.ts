import { getGroupExpenses } from '@/lib/api'
import { calculateShare } from '@/lib/totals'
import { match } from 'ts-pattern'

export type Balances = Record<
  string,
  { paid: number; paidFor: number; total: number }
>

export type Reimbursement = {
  from: string
  to: string
  amount: number
}

export function getBalances(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): Balances {
  const balances: Balances = {}

  for (const expense of expenses) {
    const paidBy = expense.paidBy.id
    const paidFors = expense.paidFor

    if (!balances[paidBy]) balances[paidBy] = { paid: 0, paidFor: 0, total: 0 }
    balances[paidBy].paid += expense.amount

    if (expense.splitMode === 'BY_PERCENTAGE') {
      for (const paidFor of paidFors) {
        if (!balances[paidFor.user.id])
          balances[paidFor.user.id] = { paid: 0, paidFor: 0, total: 0 }
        balances[paidFor.user.id].paidFor += calculateShare(
          paidFor.user.id,
          expense,
        )
      }
      continue
    }

    const totalPaidForShares = paidFors.reduce(
      (sum, paidFor) => sum + paidFor.shares,
      0,
    )
    let remaining = expense.amount
    paidFors.forEach((paidFor, index) => {
      if (!balances[paidFor.user.id])
        balances[paidFor.user.id] = { paid: 0, paidFor: 0, total: 0 }

      const isLast = index === paidFors.length - 1

      const [shares, totalShares] = match(expense.splitMode)
        .with('EVENLY', () => [1, paidFors.length])
        .with('BY_SHARES', () => [paidFor.shares, totalPaidForShares])
        .with('BY_PERCENTAGE', () => [paidFor.shares, totalPaidForShares])
        .with('BY_AMOUNT', () => [paidFor.shares, totalPaidForShares])
        .exhaustive()

      const dividedAmount = isLast
        ? remaining
        : (expense.amount * shares) / totalShares
      remaining -= dividedAmount
      balances[paidFor.user.id].paidFor += dividedAmount
    })
  }

  // rounding and add total
  for (const userId in balances) {
    // add +0 to avoid negative zeros
    balances[userId].paidFor = Math.round(balances[userId].paidFor) + 0
    balances[userId].paid = Math.round(balances[userId].paid) + 0

    balances[userId].total = balances[userId].paid - balances[userId].paidFor
  }
  return balances
}

export function getPublicBalances(reimbursements: Reimbursement[]): Balances {
  const balances: Balances = {}
  reimbursements.forEach((reimbursement) => {
    if (!balances[reimbursement.from])
      balances[reimbursement.from] = { paid: 0, paidFor: 0, total: 0 }

    if (!balances[reimbursement.to])
      balances[reimbursement.to] = { paid: 0, paidFor: 0, total: 0 }

    balances[reimbursement.from].paidFor += reimbursement.amount
    balances[reimbursement.from].total -= reimbursement.amount

    balances[reimbursement.to].paid += reimbursement.amount
    balances[reimbursement.to].total += reimbursement.amount
  })
  return balances
}

/**
 * A comparator that is stable across reimbursements.
 * This ensures that a user executing a suggested reimbursement
 * does not result in completely new repayment suggestions.
 */
function compareBalancesForReimbursements(b1: any, b2: any): number {
  // positive balances come before negative balances
  if (b1.total > 0 && 0 > b2.total) {
    return -1
  } else if (b2.total > 0 && 0 > b1.total) {
    return 1
  }
  // if signs match, sort based on userid
  return b1.userId < b2.userId ? -1 : 1
}

/**
 * Direct (unsimplified) debts: each person owes whoever paid for their share,
 * without routing payments through other group members.
 */
export function getDirectReimbursements(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): Reimbursement[] {
  const pairOwes = new Map<string, number>()

  for (const expense of expenses) {
    const balances = getBalances([expense])
    const payer = expense.paidBy.id

    for (const [userId, { total }] of Object.entries(balances)) {
      if (userId === payer || total >= 0) continue
      const key = `${userId}:${payer}`
      pairOwes.set(key, (pairOwes.get(key) ?? 0) + -total)
    }
  }

  const users = new Set<string>()
  for (const key of Array.from(pairOwes.keys())) {
    const [from, to] = key.split(':')
    users.add(from)
    users.add(to)
  }

  const userList = Array.from(users).sort()
  const reimbursements: Reimbursement[] = []

  for (let i = 0; i < userList.length; i++) {
    for (let j = i + 1; j < userList.length; j++) {
      const a = userList[i]
      const b = userList[j]
      const aOwesB = pairOwes.get(`${a}:${b}`) ?? 0
      const bOwesA = pairOwes.get(`${b}:${a}`) ?? 0
      const net = Math.round(aOwesB - bOwesA) + 0

      if (net > 0) {
        reimbursements.push({ from: a, to: b, amount: net })
      } else if (net < 0) {
        reimbursements.push({ from: b, to: a, amount: -net })
      }
    }
  }

  return reimbursements.filter(({ amount }) => amount !== 0)
}

export function getReimbursements(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
  options?: { simplifyDebts?: boolean },
): Reimbursement[] {
  if (options?.simplifyDebts === false) {
    return getDirectReimbursements(expenses)
  }
  return getSuggestedReimbursements(getBalances(expenses))
}

export function getSuggestedReimbursements(
  balances: Balances,
): Reimbursement[] {
  const balancesArray = Object.entries(balances)
    .map(([userId, { total }]) => ({ userId, total }))
    .filter((b) => b.total !== 0)
  balancesArray.sort(compareBalancesForReimbursements)
  const reimbursements: Reimbursement[] = []
  while (balancesArray.length > 1) {
    const first = balancesArray[0]
    const last = balancesArray[balancesArray.length - 1]
    const amount = first.total + last.total
    if (first.total > -last.total) {
      reimbursements.push({
        from: last.userId,
        to: first.userId,
        amount: -last.total,
      })
      first.total = amount
      balancesArray.pop()
    } else {
      reimbursements.push({
        from: last.userId,
        to: first.userId,
        amount: first.total,
      })
      last.total = amount
      balancesArray.shift()
    }
  }
  return reimbursements.filter(({ amount }) => Math.round(amount) + 0 !== 0)
}
