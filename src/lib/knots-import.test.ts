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

describe('parseKnotsExport', () => {
  beforeEach(() => {
    mockGroupFindUnique.mockResolvedValue({
      id: 'group-1',
      memberships: [
        { user: { id: 'user-ana', name: 'Ana Ferreira' } },
        { user: { id: 'user-rafael', name: 'Rafael Macedo' } },
      ],
    })
    mockCategoryFindMany.mockResolvedValue([
      { id: 1, name: 'General', grouping: 'Uncategorized' },
    ])
  })

  it('maps placeholder participant IDs to group members by name', async () => {
    const exportJson = JSON.stringify({
      participants: [
        { id: 'placeholder-ana', name: 'Ana' },
        { id: 'placeholder-rafael', name: 'Rafael' },
        { id: 'user-ana', name: 'Ana Ferreira' },
        { id: 'user-rafael', name: 'Rafael Macedo' },
      ],
      expenses: [
        {
          expenseDate: '2022-02-01T00:00:00.000Z',
          title: 'Gatos',
          category: { name: 'General' },
          amount: 3466,
          paidById: 'placeholder-ana',
          paidFor: [
            { userId: 'placeholder-ana', shares: 1733 },
            { userId: 'placeholder-rafael', shares: 1733 },
          ],
          isReimbursement: false,
          splitMode: 'EVENLY',
          recurrenceRule: 'NONE',
        },
      ],
    })

    const expenses = await parseKnotsExport(exportJson, 'group-1')

    expect(expenses).toHaveLength(1)
    expect(expenses[0].paidBy).toEqual([
      { participant: 'user-ana', amount: 3466 },
    ])
    expect(expenses[0].paidFor).toEqual([
      { participant: 'user-ana', shares: 1733 },
      { participant: 'user-rafael', shares: 1733 },
    ])
  })

  it('merges duplicate paidFor entries after participant mapping', async () => {
    const exportJson = JSON.stringify({
      participants: [
        { id: 'placeholder-ana', name: 'Ana' },
        { id: 'user-ana', name: 'Ana Ferreira' },
        { id: 'user-rafael', name: 'Rafael Macedo' },
      ],
      expenses: [
        {
          expenseDate: '2022-02-01T00:00:00.000Z',
          title: 'Merged split',
          amount: 3000,
          paidById: 'user-rafael',
          paidFor: [
            { userId: 'placeholder-ana', shares: 1000 },
            { userId: 'user-ana', shares: 500 },
            { userId: 'user-rafael', shares: 1500 },
          ],
          isReimbursement: false,
          splitMode: 'BY_AMOUNT',
          recurrenceRule: 'NONE',
        },
      ],
    })

    const expenses = await parseKnotsExport(exportJson, 'group-1')

    expect(expenses[0].paidFor).toEqual([
      { participant: 'user-ana', shares: 1500 },
      { participant: 'user-rafael', shares: 1500 },
    ])
  })

  it('lists all missing participants before importing', async () => {
    const exportJson = JSON.stringify({
      participants: [
        { id: 'user-ana', name: 'Ana Ferreira' },
        { id: 'user-rafael', name: 'Rafael Macedo' },
      ],
      expenses: [
        {
          expenseDate: '2022-02-01T00:00:00.000Z',
          title: 'Test',
          amount: 1000,
          paidById: 'user-rafael',
          paidFor: [
            { userId: 'user-ana', shares: 500 },
            { userId: 'user-rafael', shares: 500 },
          ],
          isReimbursement: false,
          splitMode: 'EVENLY',
        },
      ],
    })

    mockGroupFindUnique.mockResolvedValue({
      id: 'group-1',
      memberships: [{ user: { id: 'user-rafael', name: 'Rafael Macedo' } }],
    })

    await expect(parseKnotsExport(exportJson, 'group-1')).rejects.toThrow(
      'These export participants are not in the group: Ana Ferreira',
    )
  })

  it('analyzes missing participants with expense counts', async () => {
    const exportJson = JSON.stringify({
      participants: [
        { id: 'user-ana', name: 'Ana Ferreira' },
        { id: 'user-rafael', name: 'Rafael Macedo' },
      ],
      expenses: [
        {
          expenseDate: '2022-02-01T00:00:00.000Z',
          title: 'A',
          amount: 1000,
          paidById: 'user-rafael',
          paidFor: [
            { userId: 'user-ana', shares: 500 },
            { userId: 'user-rafael', shares: 500 },
          ],
          isReimbursement: false,
          splitMode: 'EVENLY',
        },
        {
          expenseDate: '2022-02-02T00:00:00.000Z',
          title: 'B',
          amount: 2000,
          paidById: 'user-ana',
          paidFor: [
            { userId: 'user-ana', shares: 1000 },
            { userId: 'user-rafael', shares: 1000 },
          ],
          isReimbursement: false,
          splitMode: 'EVENLY',
        },
      ],
    })

    mockGroupFindUnique.mockResolvedValue({
      id: 'group-1',
      memberships: [{ user: { id: 'user-rafael', name: 'Rafael Macedo' } }],
    })

    const { analyzeKnotsImport } = await import('@/lib/knots-import')
    const analysis = await analyzeKnotsImport(exportJson, 'group-1')

    expect(analysis.expenseCount).toBe(2)
    expect(analysis.missingParticipants).toEqual([
      { exportName: 'Ana Ferreira', expenseCount: 2 },
    ])
    expect(analysis.matchedParticipants).toEqual([
      { exportName: 'Rafael Macedo', memberName: 'Rafael Macedo' },
    ])
  })

  it('rejects exports when a participant cannot be matched', async () => {
    const exportJson = JSON.stringify({
      participants: [{ id: 'unknown', name: 'Unknown Person' }],
      expenses: [
        {
          expenseDate: '2022-02-01T00:00:00.000Z',
          title: 'Test',
          amount: 1000,
          paidById: 'unknown',
          paidFor: [{ userId: 'unknown', shares: 1000 }],
          isReimbursement: false,
          splitMode: 'EVENLY',
        },
      ],
    })

    await expect(parseKnotsExport(exportJson, 'group-1')).rejects.toThrow(
      'These export participants are not in the group: Unknown Person',
    )
  })

  describe('multi-payer import', () => {
    it('JSON with paidBy array creates correct multi-payer entries', async () => {
      const exportJson = JSON.stringify({
        participants: [
          { id: 'user-ana', name: 'Ana Ferreira' },
          { id: 'user-rafael', name: 'Rafael Macedo' },
        ],
        expenses: [
          {
            expenseDate: '2023-05-10T00:00:00.000Z',
            title: 'Dinner',
            amount: 5000,
            paidById: 'user-ana',
            paidBy: [
              { userId: 'user-ana', amount: 3000 },
              { userId: 'user-rafael', amount: 2000 },
            ],
            paidFor: [
              { userId: 'user-ana', shares: 2500 },
              { userId: 'user-rafael', shares: 2500 },
            ],
            isReimbursement: false,
            splitMode: 'EVENLY',
          },
        ],
      })

      const expenses = await parseKnotsExport(exportJson, 'group-1')

      expect(expenses).toHaveLength(1)
      expect(expenses[0].paidBy).toEqual([
        { participant: 'user-ana', amount: 3000 },
        { participant: 'user-rafael', amount: 2000 },
      ])
    })

    it('legacy JSON without paidBy array creates single-payer entry with full amount', async () => {
      const exportJson = JSON.stringify({
        participants: [
          { id: 'user-ana', name: 'Ana Ferreira' },
          { id: 'user-rafael', name: 'Rafael Macedo' },
        ],
        expenses: [
          {
            expenseDate: '2023-05-10T00:00:00.000Z',
            title: 'Groceries',
            amount: 4200,
            paidById: 'user-rafael',
            paidFor: [
              { userId: 'user-ana', shares: 2100 },
              { userId: 'user-rafael', shares: 2100 },
            ],
            isReimbursement: false,
            splitMode: 'EVENLY',
          },
        ],
      })

      const expenses = await parseKnotsExport(exportJson, 'group-1')

      expect(expenses).toHaveLength(1)
      expect(expenses[0].paidBy).toEqual([
        { participant: 'user-rafael', amount: 4200 },
      ])
    })

    it('unknown userId in paidBy array throws descriptive error', async () => {
      const exportJson = JSON.stringify({
        participants: [
          { id: 'user-ana', name: 'Ana Ferreira' },
          { id: 'user-rafael', name: 'Rafael Macedo' },
          { id: 'user-unknown', name: 'Ghost User' },
        ],
        expenses: [
          {
            expenseDate: '2023-05-10T00:00:00.000Z',
            title: 'Taxi',
            amount: 3000,
            paidById: 'user-ana',
            paidBy: [
              { userId: 'user-ana', amount: 1500 },
              { userId: 'user-unknown', amount: 1500 },
            ],
            paidFor: [
              { userId: 'user-ana', shares: 1500 },
              { userId: 'user-rafael', shares: 1500 },
            ],
            isReimbursement: false,
            splitMode: 'EVENLY',
          },
        ],
      })

      await expect(parseKnotsExport(exportJson, 'group-1')).rejects.toThrow(
        /Ghost User/,
      )
    })
  })
})
