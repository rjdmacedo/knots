import { prisma } from '@/lib/prisma'
import {
  analyzeSplitwiseImport,
  parseSplitwiseCSV,
} from '@/lib/splitwise-import'

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

const CSV = `Date,Description,Category,Cost,Currency,Rafael,Ana
2026-01-01,Lunch,General,10.00,EUR,10.00,0.00
2026-01-02,Coffee,General,4.00,EUR,0.00,4.00`

describe('splitwise-import', () => {
  beforeEach(() => {
    mockGroupFindUnique.mockResolvedValue({
      id: 'group-1',
      memberships: [
        { user: { id: 'user-rafael', name: 'Rafael Macedo' } },
        { user: { id: 'user-ana', name: 'Ana Ferreira' } },
      ],
    })
    mockCategoryFindMany.mockResolvedValue([
      { id: 1, name: 'General', grouping: 'Uncategorized' },
    ])
  })

  it('analyzes CSV column names and suggests member matches', async () => {
    const analysis = await analyzeSplitwiseImport(CSV, 'group-1')

    expect(analysis.expenseCount).toBe(2)
    expect(analysis.csvParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          csvName: 'Rafael',
          suggestedUserId: 'user-rafael',
          suggestedMemberName: 'Rafael Macedo',
        }),
        expect.objectContaining({
          csvName: 'Ana',
          suggestedUserId: 'user-ana',
          suggestedMemberName: 'Ana Ferreira',
        }),
      ]),
    )
  })

  it('imports with explicit CSV name mappings', async () => {
    const expenses = await parseSplitwiseCSV(CSV, 'group-1', {
      csvNameToUserId: {
        Rafael: 'user-rafael',
        Ana: 'user-ana',
      },
    })

    expect(expenses).toHaveLength(2)
    expect(expenses[0].paidBy).toEqual([
      { participant: 'user-rafael', amount: 1000 },
    ])
    expect(expenses[1].paidBy).toEqual([
      { participant: 'user-ana', amount: 400 },
    ])
  })

  it('detects multi-payer rows and creates paidBy array', async () => {
    const multiPayerCSV = `Date,Description,Category,Cost,Currency,Rafael,Ana
2026-01-01,Dinner,General,30.00,EUR,20.00,10.00`

    const expenses = await parseSplitwiseCSV(multiPayerCSV, 'group-1', {
      csvNameToUserId: {
        Rafael: 'user-rafael',
        Ana: 'user-ana',
      },
    })

    expect(expenses).toHaveLength(1)
    expect(expenses[0].paidBy).toEqual([
      { participant: 'user-rafael', amount: 2000 },
      { participant: 'user-ana', amount: 1000 },
    ])
  })

  it('adjusts last payer amount to reconcile rounding differences', async () => {
    // Cost is 10.00 (1000 cents), but payer columns sum to 10.01 (1001 cents)
    const roundingCSV = `Date,Description,Category,Cost,Currency,Rafael,Ana
2026-01-01,Lunch,General,10.00,EUR,6.67,3.34`

    const expenses = await parseSplitwiseCSV(roundingCSV, 'group-1', {
      csvNameToUserId: {
        Rafael: 'user-rafael',
        Ana: 'user-ana',
      },
    })

    expect(expenses).toHaveLength(1)
    const paidBy = expenses[0].paidBy
    expect(paidBy).toHaveLength(2)
    // Sum of payer amounts must equal cost (1000 cents)
    const totalPaid = paidBy.reduce(
      (sum: number, entry: { amount: number }) => sum + entry.amount,
      0,
    )
    expect(totalPaid).toBe(1000)
    // First payer keeps their original amount
    expect(paidBy[0].amount).toBe(667)
    // Last payer is adjusted: 334 + (1000 - 1001) = 333
    expect(paidBy[1].amount).toBe(333)
  })
})
