import { getCurrency } from '@/lib/currency'
import {
  distributeEqualAmounts,
  distributeWeightedAmounts,
} from '@/lib/distribute-amount'
import { randomId } from '@/lib/random-id'
import type { ExpenseFormValues } from '@/lib/schemas'
import type { Prisma } from '@prisma/client'
import { ActivityType } from '@prisma/client'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DecomposeInput = {
  values: ExpenseFormValues // amount in minor units; paidBy[0] is the single payer
  group: {
    id: string
    currency: string // symbol fallback (Group.currency)
    currencyCode: string | null // Group.currencyCode
    participants: Array<{ id: string }>
  }
  actorUserId: string
}

// expenseInclude mirrors the shape used in api.ts getExpense()
const expenseInclude = {
  paidBy: { select: { id: true, name: true, email: true } },
  paidFor: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  payers: {
    select: {
      userId: true,
      amount: true,
      user: { select: { id: true, name: true } },
    },
  },
  category: true,
  documents: true,
  recurringExpenseLink: true,
} as const

export type DecomposeResult = {
  /** Full row fetched after write with standard expenseInclude */
  // eslint-disable-next-line
  groupHalf: any
  directHalves: Array<{ id: string; nonMemberId: string; amount: number }>
}

// ---------------------------------------------------------------------------
// Pure arithmetic — exported for unit tests and the client-side banner
// ---------------------------------------------------------------------------

/**
 * Compute how the total should be split between group members and non-members.
 *
 * - All inputs use **minor units** (e.g. 10000 for 100.00 EUR).
 * - Returns `null` when every non-member slot is zero (caller should fall
 *   through to the regular group-expense path without a NON_MEMBER_SPLIT tag).
 *
 * Returned values:
 *   memberEntries    — { userId, shares } in minor units (used as paidFor shares on the Group_Half)
 *   directHalfEntries — { userId, amount } in minor units (one per non-member with amount > 0)
 *   groupHalfAmount  — sum of all member minor slots
 */
export function computeDecompositionSlots(
  values: Pick<ExpenseFormValues, 'amount' | 'splitMode' | 'paidFor'>,
  group: {
    participants: Array<{ id: string }>
    currencyCode: string | null
    currency: string
  },
): {
  memberEntries: Array<{ userId: string; shares: number }> // minor units
  directHalfEntries: Array<{ userId: string; amount: number }> // minor units
  groupHalfAmount: number
} | null {
  const memberIdSet = new Set(group.participants.map((p) => p.id))

  const memberPaidFor = values.paidFor.filter((pf) =>
    memberIdSet.has(pf.participant),
  )
  const nonMemberPaidFor = values.paidFor.filter(
    (pf) => !memberIdSet.has(pf.participant),
  )

  // Derive currency precision
  const currency = getCurrency(group.currencyCode ?? group.currency)
  const decimalDigits = currency.decimal_digits
  const factor = 10 ** decimalDigits

  // The total is already in minor units
  const totalMinor = values.amount

  // Build combined minor-unit slots in members-first order
  let memberMinorSlots: number[]
  let nonMemberMinorSlots: number[]

  switch (values.splitMode) {
    case 'BY_AMOUNT': {
      // pf.shares are already minor-unit amounts — use directly
      memberMinorSlots = memberPaidFor.map((pf) => Number(pf.shares))
      nonMemberMinorSlots = nonMemberPaidFor.map((pf) => Number(pf.shares))
      break
    }

    case 'EVENLY': {
      // One distributor call over the combined count (members first)
      const combinedCount = memberPaidFor.length + nonMemberPaidFor.length
      const totalMajor = totalMinor / factor
      const majorSlots = distributeEqualAmounts(
        totalMajor,
        combinedCount,
        decimalDigits,
      )
      // Convert major slots → minor units
      const allMinorSlots = majorSlots.map((s) => Math.round(s * factor))
      memberMinorSlots = allMinorSlots.slice(0, memberPaidFor.length)
      nonMemberMinorSlots = allMinorSlots.slice(memberPaidFor.length)
      break
    }

    case 'BY_SHARES': {
      // pf.shares are integer weights
      const memberWeights = memberPaidFor.map((pf) => Number(pf.shares))
      const nonMemberWeights = nonMemberPaidFor.map((pf) => Number(pf.shares))
      const combinedWeights = [...memberWeights, ...nonMemberWeights]
      const totalMajor = totalMinor / factor
      const majorSlots = distributeWeightedAmounts(
        totalMajor,
        combinedWeights,
        decimalDigits,
      )
      const allMinorSlots = majorSlots.map((s) => Math.round(s * factor))
      memberMinorSlots = allMinorSlots.slice(0, memberPaidFor.length)
      nonMemberMinorSlots = allMinorSlots.slice(memberPaidFor.length)
      break
    }

    case 'BY_PERCENTAGE': {
      // pf.shares are basis points (e.g. 3333 = 33.33%)
      const memberWeights = memberPaidFor.map((pf) => Number(pf.shares))
      const nonMemberWeights = nonMemberPaidFor.map((pf) => Number(pf.shares))
      const combinedWeights = [...memberWeights, ...nonMemberWeights]
      const totalMajor = totalMinor / factor
      const majorSlots = distributeWeightedAmounts(
        totalMajor,
        combinedWeights,
        decimalDigits,
      )
      const allMinorSlots = majorSlots.map((s) => Math.round(s * factor))
      memberMinorSlots = allMinorSlots.slice(0, memberPaidFor.length)
      nonMemberMinorSlots = allMinorSlots.slice(memberPaidFor.length)
      break
    }

    default: {
      // Exhaustive fallback — should never happen with a valid SplitMode
      memberMinorSlots = memberPaidFor.map(() => 0)
      nonMemberMinorSlots = nonMemberPaidFor.map(() => 0)
    }
  }

  // Build member entries (all members included, even zero-slot ones)
  const memberEntries = memberPaidFor.map((pf, i) => ({
    userId: pf.participant,
    shares: memberMinorSlots[i] ?? 0,
  }))

  // Filter out zero-slot non-members
  const directHalfEntries = nonMemberPaidFor
    .map((pf, i) => ({
      userId: pf.participant,
      amount: nonMemberMinorSlots[i] ?? 0,
    }))
    .filter((e) => e.amount > 0)

  // If all non-member slots are zero, return null → caller uses regular path
  if (directHalfEntries.length === 0) return null

  const groupHalfAmount = memberEntries.reduce((sum, e) => sum + e.shares, 0)

  return { memberEntries, directHalfEntries, groupHalfAmount }
}

// ---------------------------------------------------------------------------
// DB writer — must be called inside an already-open Prisma transaction
// ---------------------------------------------------------------------------

/**
 * Writes Group_Half + Direct_Halves inside an already-open Prisma transaction.
 * Calls computeDecompositionSlots internally.
 *
 * Create path: pass existingExpenseId = undefined → expense.create for Group_Half.
 * Update path: pass existingExpenseId = string   → expense.update for Group_Half,
 *              preserving documents, notes, originalAmount, originalCurrency,
 *              conversionRate, and recurringExpenseLink from the existing row.
 *
 * Returns null (falls back to regular group path) when computeDecompositionSlots
 * returns null — i.e. when all non-member slots are zero.
 *
 * Preconditions (enforced by caller):
 *   - values.paidFor has ≥ 1 non-member AND ≥ 1 member
 *   - values.paidBy.length === 1
 *   - values.isReimbursement === false
 *   - values.recurrenceRule === 'NONE'
 *   - values.amount > 0
 */
export async function decomposeExpense(
  input: DecomposeInput,
  existingExpenseId: string | undefined,
  tx: Prisma.TransactionClient,
): Promise<DecomposeResult | null> {
  const { values, group, actorUserId } = input
  const payerId = values.paidBy[0].participant

  // Step 0: If update path, capture the existing amount BEFORE any write
  const previousAmount = existingExpenseId
    ? ((
        await tx.expense.findUnique({
          where: { id: existingExpenseId },
          select: { amount: true },
        })
      )?.amount ?? null)
    : null

  // Step 1: Compute slots (pure arithmetic, no DB)
  const slots = computeDecompositionSlots(values, group)
  if (!slots || slots.directHalfEntries.length === 0) return null
  const { memberEntries, directHalfEntries, groupHalfAmount } = slots

  // Step 2: Currency code for Direct_Halves
  const expenseCurrencyCode = group.currencyCode ?? group.currency

  // Step 3: Build shared Group_Half data (fields common to create and update)
  const groupHalfCoreData = {
    groupId: group.id,
    title: values.title,
    expenseDate: values.expenseDate,
    categoryId: values.category,
    amount: groupHalfAmount,
    paidById: payerId,
    splitMode: 'BY_AMOUNT' as const,
    // eslint-disable-next-line
    creationMethod: 'NON_MEMBER_SPLIT' as any, // NON_MEMBER_SPLIT added to enum in task 6.1
    isReimbursement: false,
    recurrenceRule: 'NONE' as const,
    originalAmount: values.originalAmount ?? null,
    originalCurrency: values.originalCurrency || null,
    conversionRate: values.conversionRate ?? null,
  }

  // New schema columns added in task 6.1 — use any-cast until migration runs
  // eslint-disable-next-line
  const newSchemaFields: Record<string, any> = {
    linkedExpenseId: null,
    expenseCurrencyCode: null,
    originalTotalAtDecomposition: values.amount,
  }

  // Step 4: Write Group_Half
  // eslint-disable-next-line
  let groupHalfRow: any

  if (existingExpenseId) {
    // Update path: promote existing row in place.
    // documents, recurringExpenseLink, notes, originalAmount, originalCurrency,
    // conversionRate are preserved from the existing row (not overwritten here).
    await tx.expense.update({
      where: { id: existingExpenseId },
      data: {
        ...groupHalfCoreData,
        ...newSchemaFields,
        paidFor: {
          deleteMany: {},
          createMany: {
            data: memberEntries.map((e) => ({
              userId: e.userId,
              shares: e.shares,
            })),
          },
        },
        payers: {
          deleteMany: {},
          createMany: {
            data: [{ userId: payerId, amount: groupHalfAmount }],
          },
        },
      } as Parameters<typeof tx.expense.update>[0]['data'],
    })
    groupHalfRow = await tx.expense.findUniqueOrThrow({
      where: { id: existingExpenseId },
      include: expenseInclude,
    })
  } else {
    // Create path
    const groupHalfId = randomId()
    groupHalfRow = await tx.expense.create({
      data: {
        id: groupHalfId,
        ...groupHalfCoreData,
        ...newSchemaFields,
        notes: values.notes ?? null,
        paidFor: {
          createMany: {
            data: memberEntries.map((e) => ({
              userId: e.userId,
              shares: e.shares,
            })),
          },
        },
        payers: {
          createMany: {
            data: [{ userId: payerId, amount: groupHalfAmount }],
          },
        },
        ...(values.documents?.length
          ? {
              documents: {
                createMany: {
                  data: values.documents.map((d) => ({
                    id: randomId(),
                    url: d.url,
                    width: d.width,
                    height: d.height,
                  })),
                },
              },
            }
          : {}),
      } as Parameters<typeof tx.expense.create>[0]['data'],
      include: expenseInclude,
    })
  }

  // Step 5: Write Direct_Halves (one per non-member with amount > 0)
  const createdDirectHalves: Array<{
    id: string
    nonMemberId: string
    amount: number
  }> = []

  // eslint-disable-next-line
  const directHalfNewSchemaFields = (entry: {
    userId: string
    amount: number
  }): Record<string, unknown> => ({
    linkedExpenseId: groupHalfRow.id,
    expenseCurrencyCode,
    originalTotalAtDecomposition: null,
  })

  for (const entry of directHalfEntries) {
    const dhId = randomId()
    await tx.expense.create({
      // eslint-disable-next-line
      data: {
        id: dhId,
        groupId: null,
        title: values.title,
        expenseDate: values.expenseDate,
        categoryId: values.category,
        amount: entry.amount,
        paidById: payerId,
        splitMode: 'BY_AMOUNT' as const,
        // eslint-disable-next-line
        creationMethod: 'NON_MEMBER_SPLIT' as any, // NON_MEMBER_SPLIT added to enum in task 6.1
        isReimbursement: false,
        recurrenceRule: 'NONE' as const,
        originalAmount: null,
        originalCurrency: null,
        conversionRate: null,
        notes: null,
        ...directHalfNewSchemaFields(entry),
        paidFor: {
          createMany: {
            data: [{ userId: entry.userId, shares: entry.amount }],
          },
        },
        payers: {
          createMany: {
            data: [{ userId: payerId, amount: entry.amount }],
          },
        },
      } as Parameters<typeof tx.expense.create>[0]['data'],
      select: { id: true },
    })
    createdDirectHalves.push({
      id: dhId,
      nonMemberId: entry.userId,
      amount: entry.amount,
    })
  }

  // Step 6: Log activity
  const activityType = existingExpenseId
    ? ActivityType.UPDATE_EXPENSE
    : ActivityType.CREATE_EXPENSE

  await tx.activity.create({
    data: {
      id: randomId(),
      groupId: group.id,
      time: new Date(),
      activityType,
      participantId: actorUserId,
      expenseId: groupHalfRow.id,
      data: values.title,
      changes: {
        createMany: {
          data: [
            {
              field: 'amount',
              oldValue: previousAmount !== null ? String(previousAmount) : null,
              newValue: String(groupHalfAmount),
            },
            {
              field: 'paidBy',
              oldValue: null,
              newValue: payerId,
            },
            {
              field: 'paidFor',
              oldValue: null,
              newValue: JSON.stringify(memberEntries),
            },
          ],
        },
      },
    },
  })

  return { groupHalf: groupHalfRow, directHalves: createdDirectHalves }
}
