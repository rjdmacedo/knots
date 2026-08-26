/**
 * @jest-environment node
 *
 * JSON group export — includes linkedExpenseId (R8.5).
 *
 * Group_Half rows always export linkedExpenseId = null because Direct_Halves
 * have groupId = null and are excluded from group exports.
 */

import { prisma } from '@/lib/prisma'
import { GET } from './route'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    group: {
      findUnique: jest.fn(),
    },
  },
}))

const mockGroupFindUnique = prisma.group.findUnique as jest.Mock

describe('GET /groups/[groupId]/expenses/export/json', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('includes linkedExpenseId on each exported expense row (R8.5)', async () => {
    mockGroupFindUnique.mockResolvedValue({
      id: 'group-casa',
      name: 'Casa',
      currency: '€',
      currencyCode: 'EUR',
      expenses: [
        {
          createdAt: new Date('2025-01-20T00:00:00.000Z'),
          expenseDate: new Date('2025-01-20T00:00:00.000Z'),
          title: 'Jantar (com Dave)',
          category: { grouping: 'Food and drink', name: 'Restaurant' },
          amount: 7500,
          originalAmount: null,
          originalCurrency: null,
          conversionRate: null,
          paidById: 'rafael',
          payers: [{ userId: 'rafael', amount: 7500 }],
          paidFor: [
            { userId: 'rafael', shares: 2500 },
            { userId: 'alice', shares: 2500 },
            { userId: 'bob', shares: 2500 },
          ],
          isReimbursement: false,
          splitMode: 'BY_AMOUNT',
          recurrenceRule: 'NONE',
          linkedExpenseId: null,
        },
      ],
      memberships: [
        { user: { id: 'rafael', name: 'Rafael' } },
        { user: { id: 'alice', name: 'Alice' } },
        { user: { id: 'bob', name: 'Bob' } },
      ],
    })

    const response = await GET(new Request('http://localhost/export/json'), {
      params: Promise.resolve({ groupId: 'group-casa' }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as any

    expect(mockGroupFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          expenses: expect.objectContaining({
            select: expect.objectContaining({
              linkedExpenseId: true,
            }),
          }),
        }),
      }),
    )

    expect(body.expenses).toHaveLength(1)
    expect(body.expenses[0]).toHaveProperty('linkedExpenseId', null)
  })
})
