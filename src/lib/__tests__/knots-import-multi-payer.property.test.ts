/**
 * Property-based tests for Knots JSON multi-payer import.
 *
 * Feature: multi-payer-expenses
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { parseKnotsExport } from '@/lib/knots-import'
import { prisma } from '@/lib/prisma'
import fc from 'fast-check'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    group: {
      findUnique: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
  },
}))

const mockGroupFindUnique = prisma.group.findUnique as jest.Mock
const mockCategoryFindMany = prisma.category.findMany as jest.Mock

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

/**
 * Generate a valid participant name (alphabetic, non-empty, no substrings of each other).
 */
const arbParticipantName = fc
  .stringMatching(/^[A-Z][a-z]{2,7} [A-Z][a-z]{2,7}$/)
  .filter((name) => name.length >= 5)

/**
 * Generate a set of group members with unique, non-overlapping names.
 */
function arbGroupMembers(minCount: number, maxCount: number) {
  return fc
    .array(
      fc.record({
        id: fc.uuid(),
        name: arbParticipantName,
      }),
      { minLength: maxCount + 2, maxLength: maxCount + 5 },
    )
    .map((members) => {
      // Deduplicate by name (case-insensitive) and filter out substrings
      const unique: Array<{ id: string; name: string }> = []
      const seenNames = new Set<string>()
      for (const m of members) {
        const lower = m.name.toLowerCase()
        if (seenNames.has(lower)) continue
        // Ensure no name is a substring of another already-selected name
        const isSubstring = unique.some(
          (existing) =>
            existing.name.toLowerCase().includes(lower) ||
            lower.includes(existing.name.toLowerCase()),
        )
        if (isSubstring) continue
        seenNames.add(lower)
        unique.push(m)
        if (unique.length >= maxCount) break
      }
      return unique
    })
    .filter((members) => members.length >= minCount)
    .map((members) => members.slice(0, maxCount))
}

/**
 * Generate a valid paidBy array with M entries (1 to numParticipants)
 * whose amounts are positive integers summing to the given total.
 */
function arbPaidByArray(
  participantIds: string[],
  total: number,
): fc.Arbitrary<Array<{ userId: string; amount: number }>> {
  const maxPayers = Math.min(participantIds.length, 5)
  return fc.integer({ min: 1, max: maxPayers }).chain((numPayers) =>
    fc
      .shuffledSubarray(participantIds, {
        minLength: numPayers,
        maxLength: numPayers,
      })
      .chain((payerIds) => {
        if (numPayers === 1) {
          return fc.constant([{ userId: payerIds[0], amount: total }])
        }
        // Generate amounts for first N-1 payers, remainder goes to last
        return fc
          .array(fc.integer({ min: 1, max: Math.max(1, total - numPayers) }), {
            minLength: numPayers - 1,
            maxLength: numPayers - 1,
          })
          .map((rawAmounts) => {
            const rawSum = rawAmounts.reduce((s, a) => s + a, 0)
            const scaledAmounts = rawAmounts.map((a) =>
              Math.max(1, Math.floor((a / rawSum) * (total - 1))),
            )
            const scaledSum = scaledAmounts.reduce((s, a) => s + a, 0)
            const lastAmount = total - scaledSum

            if (lastAmount <= 0) {
              // Fallback: evenly distribute with remainder to last
              const fallback = payerIds.slice(0, -1).map(() => 1)
              const fallbackLast = total - fallback.reduce((s, a) => s + a, 0)
              return payerIds.map((id, i) => ({
                userId: id,
                amount: i < numPayers - 1 ? fallback[i] : fallbackLast,
              }))
            }

            return payerIds.map((id, i) => ({
              userId: id,
              amount: i < numPayers - 1 ? scaledAmounts[i] : lastAmount,
            }))
          })
          .filter((payers) => payers.every((p) => p.amount > 0))
      }),
  )
}

/**
 * Generate a paidFor array for the given participants and total.
 */
function arbPaidFor(
  participantIds: string[],
  total: number,
): fc.Arbitrary<Array<{ userId: string; shares: number }>> {
  return fc
    .shuffledSubarray(participantIds, {
      minLength: 1,
      maxLength: participantIds.length,
    })
    .map((beneficiaryIds) => {
      const numBeneficiaries = beneficiaryIds.length
      const share = Math.floor(total / numBeneficiaries)
      const remainder = total - share * numBeneficiaries
      return beneficiaryIds.map((id, i) => ({
        userId: id,
        shares: share + (i === numBeneficiaries - 1 ? remainder : 0),
      }))
    })
    .filter((entries) => entries.every((e) => e.shares > 0))
}

/**
 * Generate a Knots JSON export where at least one payer userId references
 * a participant whose name does NOT match any group member.
 */
function arbKnotsExportWithNonMemberPayer() {
  return arbGroupMembers(2, 5).chain((groupMembers) => {
    const nonMemberNameArb = fc
      .record({
        id: fc.uuid(),
        name: arbParticipantName,
      })
      .filter((nonMember) => {
        const lower = nonMember.name.toLowerCase()
        return !groupMembers.some(
          (m) =>
            m.name.toLowerCase() === lower ||
            m.name.toLowerCase().includes(lower) ||
            lower.includes(m.name.toLowerCase()),
        )
      })

    return nonMemberNameArb.chain((nonMember) =>
      fc
        .record({
          expenseTotal: fc.integer({ min: 200, max: 1_000_000 }),
          nonMemberPayerAmount: fc.integer({ min: 1, max: 100 }),
        })
        .map(({ expenseTotal, nonMemberPayerAmount }) => {
          const clampedNonMemberAmount = Math.min(
            nonMemberPayerAmount,
            expenseTotal - 1,
          )
          const memberPayerAmount = expenseTotal - clampedNonMemberAmount

          const validPayer = groupMembers[0]
          const beneficiary = groupMembers[1] || groupMembers[0]

          const allParticipants = [
            ...groupMembers.map((m) => ({ id: m.id, name: m.name })),
            { id: nonMember.id, name: nonMember.name },
          ]

          const exportData = {
            participants: allParticipants,
            expenses: [
              {
                expenseDate: '2024-01-15T00:00:00.000Z',
                title: 'Test Expense',
                amount: expenseTotal,
                paidById: validPayer.id,
                paidBy: [
                  { userId: validPayer.id, amount: memberPayerAmount },
                  { userId: nonMember.id, amount: clampedNonMemberAmount },
                ],
                paidFor: [
                  {
                    userId: validPayer.id,
                    shares: Math.floor(expenseTotal / 2),
                  },
                  {
                    userId: beneficiary.id,
                    shares: expenseTotal - Math.floor(expenseTotal / 2),
                  },
                ],
                isReimbursement: false,
                splitMode: 'EVENLY' as const,
              },
            ],
          }

          return {
            groupMembers,
            nonMemberName: nonMember.name,
            exportJson: JSON.stringify(exportData),
          }
        }),
    )
  })
}

// --- Tests ---

describe('Knots Import Multi-Payer — Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCategoryFindMany.mockResolvedValue([
      { id: 1, name: 'General', grouping: 'Uncategorized' },
    ])
  })

  /**
   * Property 9: Knots JSON Multi-Payer Import
   *
   * **Validates: Requirements 8.1**
   *
   * For any Knots JSON export expense containing a `paidBy` array with M entries,
   * the importer SHALL create exactly M ExpensePaidBy rows with matching userIds
   * and amounts.
   */
  describe('Property 9: Knots JSON Multi-Payer Import', () => {
    it('M entries in paidBy array → M paidBy entries with matching participant/amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbGroupMembers(2, 6).chain((members) => {
            const ids = members.map((m) => m.id)
            return fc
              .integer({ min: 100, max: 1_000_000 })
              .chain((total) =>
                fc.tuple(
                  arbPaidByArray(ids, total),
                  arbPaidFor(ids, total),
                  fc.constant({ members, total }),
                ),
              )
          }),
          async ([paidByArray, paidFor, { members, total }]) => {
            // Set up mock: group has exactly these participants as members
            mockGroupFindUnique.mockResolvedValue({
              id: 'group-1',
              memberships: members.map((m) => ({
                user: { id: m.id, name: m.name },
              })),
            })

            const exportJson = JSON.stringify({
              participants: members.map((m) => ({ id: m.id, name: m.name })),
              expenses: [
                {
                  expenseDate: '2024-01-15T00:00:00.000Z',
                  title: 'Test Expense',
                  category: { name: 'General' },
                  amount: total,
                  paidById: paidByArray[0].userId,
                  paidBy: paidByArray,
                  paidFor,
                  isReimbursement: false,
                  splitMode: 'EVENLY',
                },
              ],
            })

            const expenses = await parseKnotsExport(exportJson, 'group-1')

            // Assert: exactly M paidBy entries
            expect(expenses).toHaveLength(1)
            expect(expenses[0].paidBy).toHaveLength(paidByArray.length)

            // Assert: each entry has matching participant ID and amount
            for (let i = 0; i < paidByArray.length; i++) {
              expect(expenses[0].paidBy[i].participant).toBe(
                paidByArray[i].userId,
              )
              expect(expenses[0].paidBy[i].amount).toBe(paidByArray[i].amount)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('paidBy array with varying M (1 to max participants) produces correct count across multiple expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbGroupMembers(2, 6).chain((members) => {
            const ids = members.map((m) => m.id)
            return fc
              .array(
                fc
                  .integer({ min: 100, max: 500_000 })
                  .chain((total) =>
                    fc.tuple(
                      arbPaidByArray(ids, total),
                      arbPaidFor(ids, total),
                      fc.constant(total),
                    ),
                  ),
                { minLength: 1, maxLength: 3 },
              )
              .map((expenseData) => ({ members, expenseData }))
          }),
          async ({ members, expenseData }) => {
            mockGroupFindUnique.mockResolvedValue({
              id: 'group-1',
              memberships: members.map((m) => ({
                user: { id: m.id, name: m.name },
              })),
            })

            const expenses = expenseData.map(
              ([paidByArray, paidFor, total], idx) => ({
                expenseDate: `2024-01-${String(idx + 1).padStart(2, '0')}T00:00:00.000Z`,
                title: `Expense ${idx + 1}`,
                category: { name: 'General' },
                amount: total,
                paidById: paidByArray[0].userId,
                paidBy: paidByArray,
                paidFor,
                isReimbursement: false,
                splitMode: 'EVENLY' as const,
              }),
            )

            const exportJson = JSON.stringify({
              participants: members.map((m) => ({ id: m.id, name: m.name })),
              expenses,
            })

            const result = await parseKnotsExport(exportJson, 'group-1')

            // Assert: each expense has the correct number of paidBy entries
            expect(result).toHaveLength(expenseData.length)
            for (let i = 0; i < expenseData.length; i++) {
              const [paidByArray] = expenseData[i]
              expect(result[i].paidBy).toHaveLength(paidByArray.length)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  /**
   * Property 10: Payer UserId Validation
   *
   * **Validates: Requirements 1.6, 8.3, 11.4, 11.5**
   *
   * For any expense creation or update request, if any payer's userId maps to a
   * participant name that is not a member of the target group, the system SHALL
   * reject the request with a descriptive error.
   */
  describe('Property 10: Payer UserId Validation', () => {
    it('non-member userId in paidBy array causes rejection with descriptive error', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbKnotsExportWithNonMemberPayer(),
          async ({ groupMembers, nonMemberName, exportJson }) => {
            // Mock the group to only contain the valid members (not the non-member)
            mockGroupFindUnique.mockResolvedValue({
              id: 'test-group',
              memberships: groupMembers.map((m) => ({
                user: { id: m.id, name: m.name },
              })),
            })

            // parseKnotsExport should reject because the non-member payer can't
            // be matched to a group member
            await expect(
              parseKnotsExport(exportJson, 'test-group'),
            ).rejects.toThrow()

            // Additionally verify the error message references the non-member
            try {
              await parseKnotsExport(exportJson, 'test-group')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              const message = (error as Error).message
              // The error should mention either the non-member name or "not in the group"
              const mentionsNonMember =
                message.includes(nonMemberName) ||
                message.includes('not in the group')
              expect(mentionsNonMember).toBe(true)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
