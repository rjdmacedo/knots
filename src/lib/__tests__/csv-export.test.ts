import {
  buildCsvRows,
  computeParticipantNet,
  ExportExpense,
  formatPaidBy,
  formatSplitWith,
  generateGroupExpensesCsv,
} from '@/lib/csv-export'
import { Currency } from '@/lib/currency'
import { parseKnotsExport } from '@/lib/knots-import'
import { prisma } from '@/lib/prisma'

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

const TEST_CURRENCY: Currency = {
  name: 'Euro',
  symbol_native: '€',
  symbol: '€',
  code: 'EUR',
  name_plural: 'euros',
  rounding: 0,
  decimal_digits: 2,
}

describe('csv-export', () => {
  const participants = [
    { id: 'u1', name: 'Rafael' },
    { id: 'u2', name: 'Alice' },
    { id: 'u3', name: 'Bob' },
  ]
  const participantMap = new Map(participants.map((p) => [p.id, p.name]))

  describe('computeParticipantNet', () => {
    it('correctly calculates net when single payer is also a beneficiary (split evenly)', () => {
      // 90 EUR split 3 ways (30 EUR each). Rafael paid all 90 EUR.
      const expense: Parameters<typeof computeParticipantNet>[1] = {
        amount: 9000,
        paidById: 'u1',
        payers: [],
        paidFor: [
          { userId: 'u1', shares: 1 },
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
        isReimbursement: false,
        splitMode: 'EVENLY',
      }

      // Rafael: paid 90, consumed 30 -> net +60
      expect(computeParticipantNet('u1', expense, TEST_CURRENCY)).toBe(60)
      // Alice: paid 0, consumed 30 -> net -30
      expect(computeParticipantNet('u2', expense, TEST_CURRENCY)).toBe(-30)
      // Bob: paid 0, consumed 30 -> net -30
      expect(computeParticipantNet('u3', expense, TEST_CURRENCY)).toBe(-30)
    })

    it('correctly calculates net when payer is NOT a beneficiary (e.g. bought for others)', () => {
      // Rafael paid 50 EUR for Alice and Bob (25 EUR each). Rafael did not partake.
      const expense: Parameters<typeof computeParticipantNet>[1] = {
        amount: 5000,
        paidById: 'u1',
        payers: [],
        paidFor: [
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
        isReimbursement: false,
        splitMode: 'EVENLY',
      }

      // Rafael paid 50, consumed 0 -> net +50
      expect(computeParticipantNet('u1', expense, TEST_CURRENCY)).toBe(50)
      // Alice: net -25
      expect(computeParticipantNet('u2', expense, TEST_CURRENCY)).toBe(-25)
      // Bob: net -25
      expect(computeParticipantNet('u3', expense, TEST_CURRENCY)).toBe(-25)
    })

    it('correctly calculates net for multi-payer expense', () => {
      // Total 100 EUR. Rafael paid 60, Alice paid 40.
      // Split evenly among Rafael, Alice, Bob, Carol (25 each).
      const expense: Parameters<typeof computeParticipantNet>[1] = {
        amount: 10000,
        paidById: 'u1',
        payers: [
          { userId: 'u1', amount: 6000 },
          { userId: 'u2', amount: 4000 },
        ],
        paidFor: [
          { userId: 'u1', shares: 1 },
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
        isReimbursement: false,
        splitMode: 'EVENLY',
      }

      // Each share is 100 / 3 = 33.3333...
      // Rafael: 60 - 33.33 = +26.67
      expect(computeParticipantNet('u1', expense, TEST_CURRENCY)).toBe(26.67)
      // Alice: 40 - 33.33 = +6.67
      expect(computeParticipantNet('u2', expense, TEST_CURRENCY)).toBe(6.67)
      // Bob: 0 - 33.33 = -33.33
      expect(computeParticipantNet('u3', expense, TEST_CURRENCY)).toBe(-33.33)
    })

    it('correctly calculates net for reimbursement', () => {
      // Bob transfers 25 EUR to Rafael
      const expense: Parameters<typeof computeParticipantNet>[1] = {
        amount: 2500,
        paidById: 'u3',
        payers: [],
        paidFor: [{ userId: 'u1', shares: 2500 }],
        isReimbursement: true,
        splitMode: 'BY_AMOUNT',
      }

      // Bob paid 25 EUR to settle debt -> +25
      expect(computeParticipantNet('u3', expense, TEST_CURRENCY)).toBe(25)
      // Rafael received 25 EUR -> -25
      expect(computeParticipantNet('u1', expense, TEST_CURRENCY)).toBe(-25)
      // Alice uninvolved -> 0
      expect(computeParticipantNet('u2', expense, TEST_CURRENCY)).toBe(0)
    })
  })

  describe('formatPaidBy and formatSplitWith', () => {
    it('formats single payer name', () => {
      const expense = {
        amount: 5000,
        paidById: 'u1',
        paidBy: { id: 'u1', name: 'Rafael' },
        payers: [],
      }
      expect(formatPaidBy(expense, TEST_CURRENCY, participantMap)).toBe(
        'Rafael',
      )
    })

    it('formats multiple payers with formatted amounts', () => {
      const expense = {
        amount: 10000,
        paidById: 'u1',
        payers: [
          { userId: 'u1', amount: 6000 },
          { userId: 'u2', amount: 4000 },
        ],
      }
      expect(formatPaidBy(expense, TEST_CURRENCY, participantMap)).toBe(
        'Rafael (60.00), Alice (40.00)',
      )
    })

    it('formats splitWith as "All" when all participants are included', () => {
      const expense = {
        paidFor: [
          { userId: 'u1', shares: 1 },
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
      }
      expect(formatSplitWith(expense, participants, participantMap)).toBe('All')
    })

    it('formats splitWith as comma-separated names when subset of participants are included', () => {
      const expense = {
        paidFor: [
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
      }
      expect(formatSplitWith(expense, participants, participantMap)).toBe(
        'Alice, Bob',
      )
    })
  })

  describe('buildCsvRows', () => {
    const group = { currency: 'EUR', currencyCode: 'EUR' }
    const expenses: ExportExpense[] = [
      {
        expenseDate: new Date('2026-03-01'),
        title: 'Team Dinner',
        category: { name: 'Food' },
        amount: 9000,
        paidById: 'u1',
        payers: [],
        paidFor: [
          { userId: 'u1', shares: 1 },
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
        isReimbursement: false,
        splitMode: 'EVENLY',
      },
      {
        expenseDate: new Date('2026-03-02'),
        title: 'Taxi for Bob and Alice',
        category: { name: 'Transport' },
        amount: 3000,
        paidById: 'u1',
        payers: [],
        paidFor: [
          { userId: 'u2', shares: 1 },
          { userId: 'u3', shares: 1 },
        ],
        isReimbursement: false,
        splitMode: 'EVENLY',
      },
    ]

    it('generates expense rows, TOTAL BALANCE row, and SETTLEMENT rows', () => {
      const rows = buildCsvRows(group, participants, expenses)

      // 2 expenses + 1 TOTAL BALANCE + 2 settlements (Alice -> Rafael, Bob -> Rafael)
      expect(rows.length).toBe(5)

      // First expense: Dinner (90 EUR: Rafael pays, 30 each)
      expect(rows[0]).toMatchObject({
        title: 'Team Dinner',
        amount: '90.00',
        paidBy: 'Rafael',
        splitWith: 'All',
        Rafael: 60,
        Alice: -30,
        Bob: -30,
      })

      // Second expense: Taxi (30 EUR: Rafael pays for Alice and Bob, 15 each)
      expect(rows[1]).toMatchObject({
        title: 'Taxi for Bob and Alice',
        amount: '30.00',
        paidBy: 'Rafael',
        splitWith: 'Alice, Bob',
        Rafael: 30,
        Alice: -15,
        Bob: -15,
      })

      // TOTAL BALANCE row
      expect(rows[2]).toMatchObject({
        title: 'TOTAL BALANCE',
        amount: '120.00',
        Rafael: 90,
        Alice: -45,
        Bob: -45,
      })

      // Settlements: Alice pays 45 EUR to Rafael, Bob pays 45 EUR to Rafael
      const settlements = rows.slice(3)
      expect(settlements).toHaveLength(2)

      const aliceSettlement = settlements.find((s) => s.paidBy === 'Alice')
      expect(aliceSettlement).toMatchObject({
        title: 'Settlement: Alice -> Rafael',
        amount: '45.00',
        paidBy: 'Alice',
        splitWith: 'Rafael',
      })

      const bobSettlement = settlements.find((s) => s.paidBy === 'Bob')
      expect(bobSettlement).toMatchObject({
        title: 'Settlement: Bob -> Rafael',
        amount: '45.00',
        paidBy: 'Bob',
        splitWith: 'Rafael',
      })
    })

    it('generates parseable CSV string that can round-trip through knots-import', async () => {
      const csv = generateGroupExpensesCsv(group, participants, expenses)
      expect(csv).toContain('Paid by')
      expect(csv).toContain('Split with')
      expect(csv).toContain('TOTAL BALANCE')
      expect(csv).toContain('Settlement: Alice -> Rafael')

      // Mock prisma for knots-import test
      mockGroupFindUnique.mockResolvedValue({
        id: 'group-1',
        memberships: [
          { user: { id: 'user-rafael', name: 'Rafael' } },
          { user: { id: 'user-alice', name: 'Alice' } },
          { user: { id: 'user-bob', name: 'Bob' } },
        ],
      })
      mockCategoryFindMany.mockResolvedValue([
        { id: 1, name: 'Food', grouping: 'Meals' },
        { id: 2, name: 'Transport', grouping: 'Transit' },
      ])

      // Re-importing should parse the 2 expenses and ignore TOTAL BALANCE and Settlement rows
      const imported = await parseKnotsExport(csv, 'group-1')
      expect(imported).toHaveLength(2)
      expect(imported[0].title).toBe('Team Dinner')
      expect(imported[0].amount).toBe(9000)
      expect(imported[1].title).toBe('Taxi for Bob and Alice')
      expect(imported[1].amount).toBe(3000)
    })
  })
})
