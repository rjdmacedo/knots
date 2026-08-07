/**
 * Property-based tests for multi-payer validation.
 *
 * Feature: multi-payer-expenses
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { TRPCError } from '@trpc/server'
import fc from 'fast-check'
import { createExpense } from '../api'
import type { ExpenseFormValues } from '../schemas'

// Mock nanoid
jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-nanoid',
}))

// Mock prisma
const mockGroupFindUnique = jest.fn()
const mockExpenseCreate = jest.fn()
const mockActivityCreate = jest.fn()
const mockRecurringExpenseLinkFindMany = jest.fn()

jest.mock('../prisma', () => ({
  prisma: {
    group: {
      findUnique: (...args: unknown[]) => mockGroupFindUnique(...args),
    },
    expense: {
      create: (...args: unknown[]) => mockExpenseCreate(...args),
    },
    activity: {
      create: (...args: unknown[]) => mockActivityCreate(...args),
    },
    recurringExpenseLink: {
      findMany: (...args: unknown[]) =>
        mockRecurringExpenseLinkFindMany(...args),
    },
    expenseCategoryMapping: {
      upsert: jest.fn(),
    },
  },
}))

// Mock rrule to avoid import issues
jest.mock('rrule', () => ({
  RRule: class {
    static fromString() {
      return { after: () => new Date() }
    }
  },
}))

// Mock payments module
jest.mock('../payments', () => ({
  assertPaymentEditable: jest.fn(),
}))

// --- Constants ---

const PBT_NUM_RUNS = 100
const GROUP_ID = 'group-1'

// --- Generators ---

/**
 * Generate a list of unique participant IDs (2–8 participants).
 */
const arbParticipantIds = fc
  .array(fc.uuid(), { minLength: 2, maxLength: 8 })
  .map((ids) => Array.from(new Set(ids)))
  .filter((ids) => ids.length >= 2)

/**
 * Generate a paidBy array that contains at least one duplicate userId.
 * Strategy: pick participants, then force at least one to appear twice.
 */
function arbDuplicatePaidBy(
  participantIds: string[],
  total: number,
): fc.Arbitrary<Array<{ participant: string; amount: number }>> {
  return fc
    .integer({ min: 0, max: participantIds.length - 1 })
    .chain((dupIndex) => {
      const duplicateId = participantIds[dupIndex]
      // Create an array with at least 2 entries for the same participant
      const numExtraEntries = Math.max(
        0,
        Math.min(participantIds.length - 1, 3),
      )
      return fc
        .integer({ min: 2, max: Math.max(2, numExtraEntries + 1) })
        .chain((numEntries) => {
          // Distribute the total across numEntries entries, ensuring all > 0
          return arbPositiveAmountsSummingTo(total, numEntries).map(
            (amounts) => {
              const entries: Array<{ participant: string; amount: number }> = []
              // First entry is the duplicate
              entries.push({ participant: duplicateId, amount: amounts[0] })
              // Fill middle entries with other participants or duplicateId
              for (let i = 1; i < numEntries - 1; i++) {
                // Use a different participant if available
                const otherId =
                  participantIds[(dupIndex + i) % participantIds.length]
                entries.push({ participant: otherId, amount: amounts[i] })
              }
              // Last entry is always the duplicate to guarantee duplication
              entries.push({
                participant: duplicateId,
                amount: amounts[numEntries - 1],
              })
              return entries
            },
          )
        })
    })
}

/**
 * Generate N positive integers that sum exactly to `total`.
 */
function arbPositiveAmountsSummingTo(
  total: number,
  n: number,
): fc.Arbitrary<number[]> {
  if (n === 1) return fc.constant([total])
  // Generate n-1 cut points in [1, total-1], then derive amounts
  return fc
    .array(fc.integer({ min: 1, max: total - 1 }), {
      minLength: n - 1,
      maxLength: n - 1,
    })
    .map((cuts) => {
      const sorted = [...cuts, 0, total].sort((a, b) => a - b)
      const amounts: number[] = []
      for (let i = 1; i < sorted.length; i++) {
        amounts.push(sorted[i] - sorted[i - 1])
      }
      return amounts
    })
    .filter((amounts) => amounts.every((a) => a > 0))
}

function makeExpenseFormValues(
  overrides: Partial<ExpenseFormValues> = {},
): ExpenseFormValues {
  return {
    expenseDate: new Date('2024-06-15'),
    title: 'Test Expense',
    category: 1,
    amount: 10000,
    paidBy: [{ participant: 'default-payer', amount: 10000 }],
    paidFor: [
      { participant: 'p1', shares: 1 },
      { participant: 'p2', shares: 1 },
    ],
    splitMode: 'EVENLY',
    isReimbursement: false,
    documents: [],
    notes: '',
    saveDefaultSplittingOptions: false,
    recurrenceRule: 'NONE',
    ...overrides,
  } as ExpenseFormValues
}

// --- Property Tests ---

describe('Feature: multi-payer-expenses, Property 17: No Duplicate Payer Participants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActivityCreate.mockResolvedValue({ id: 'activity-1', changes: [] })
    mockRecurringExpenseLinkFindMany.mockResolvedValue([])
    mockExpenseCreate.mockResolvedValue({ id: 'expense-1' })
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * For any expense submission containing duplicate userId entries in paidBy,
   * the API SHALL reject with a BAD_REQUEST TRPCError containing
   * "Duplicate payer: {userId}".
   */
  it('rejects paidBy arrays with duplicate userId entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbParticipantIds,
        fc.integer({ min: 200, max: 1_000_000 }),
        async (participantIds, total) => {
          // Set up group with these participants
          mockGroupFindUnique.mockResolvedValue({
            id: GROUP_ID,
            memberships: participantIds.map((id) => ({
              user: { id, name: id, email: `${id}@test.com` },
            })),
            participants: participantIds.map((id) => ({
              id,
              name: id,
              email: `${id}@test.com`,
            })),
          })

          // Generate paidBy with at least one duplicate
          const paidBy = await fc.sample(
            arbDuplicatePaidBy(participantIds, total),
            1,
          )[0]

          // Build paidFor using first 2 participants
          const paidFor = participantIds.slice(0, 2).map((id) => ({
            participant: id,
            shares: 1,
          }))

          const values = makeExpenseFormValues({
            amount: total,
            paidBy,
            paidFor,
          })

          try {
            await createExpense(values, GROUP_ID)
            // Should not reach here
            throw new Error('Expected TRPCError but createExpense succeeded')
          } catch (error) {
            expect(error).toBeInstanceOf(TRPCError)
            const trpcError = error as TRPCError
            expect(trpcError.code).toBe('BAD_REQUEST')
            expect(trpcError.message).toMatch(/^Duplicate payer: /)
          }
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  }, 30_000)
})
