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
    expect(expenses[0].paidBy).toBe('user-rafael')
    expect(expenses[1].paidBy).toBe('user-ana')
  })
})
