import { getGroupExpenses } from '@/lib/api'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { getFriendExpenses } from '@/lib/friend-expenses'

jest.mock('@/lib/friend-balances-db', () => ({
  getSharedGroupsForUsers: jest.fn(),
}))

jest.mock('@/lib/api', () => ({
  getGroupExpenses: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    groupMembership: {
      groupBy: jest.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

const mockGetSharedGroups = getSharedGroupsForUsers as jest.Mock
const mockGetGroupExpenses = getGroupExpenses as jest.Mock
const mockGroupBy = prisma.groupMembership.groupBy as jest.Mock

const currentUserId = 'user-1'
const friendUserId = 'user-2'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getFriendExpenses', () => {
  it('returns expenses from all shared groups where both friends are involved', async () => {
    mockGetSharedGroups.mockResolvedValue([
      {
        id: 'group-direct',
        name: 'Ana',
        currency: '€',
        currencyCode: 'EUR',
      },
      {
        id: 'group-casa',
        name: 'Casa',
        currency: '€',
        currencyCode: 'EUR',
      },
    ])
    mockGroupBy.mockResolvedValue([
      { groupId: 'group-direct', _count: { groupId: 2 } },
      { groupId: 'group-casa', _count: { groupId: 3 } },
    ])
    mockGetGroupExpenses.mockImplementation(async (groupId: string) => {
      if (groupId === 'group-direct') {
        return [
          {
            id: 'exp-direct',
            title: 'Coffee',
            amount: 500,
            expenseDate: new Date('2026-06-01'),
            createdAt: new Date('2026-06-01T10:00:00Z'),
            paidBy: { id: currentUserId, name: 'Rafael' },
            paidFor: [
              { user: { id: friendUserId, name: 'Ana' }, shares: '10000' },
            ],
            isReimbursement: false,
            category: null,
            splitMode: 'EVENLY',
            recurrenceRule: null,
            notes: null,
            _count: { documents: 0 },
          },
        ]
      }
      return [
        {
          id: 'exp-casa',
          title: 'Rent',
          amount: 100000,
          expenseDate: new Date('2026-06-15'),
          createdAt: new Date('2026-06-15T10:00:00Z'),
          paidBy: { id: currentUserId, name: 'Rafael' },
          paidFor: [
            { user: { id: friendUserId, name: 'Ana' }, shares: '5000' },
            { user: { id: 'user-3', name: 'Other' }, shares: '5000' },
          ],
          isReimbursement: false,
          category: null,
          splitMode: 'EVENLY',
          recurrenceRule: null,
          notes: null,
          _count: { documents: 0 },
        },
        {
          id: 'exp-solo',
          title: 'Solo',
          amount: 1000,
          expenseDate: new Date('2026-06-20'),
          createdAt: new Date('2026-06-20T10:00:00Z'),
          paidBy: { id: 'user-3', name: 'Other' },
          paidFor: [{ user: { id: 'user-3', name: 'Other' }, shares: '10000' }],
          isReimbursement: false,
          category: null,
          splitMode: 'EVENLY',
          recurrenceRule: null,
          notes: null,
          _count: { documents: 0 },
        },
      ]
    })

    const result = await getFriendExpenses(currentUserId, friendUserId)

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.expense.id).sort()).toEqual([
      'exp-casa',
      'exp-direct',
    ])
  })

  it('returns empty array when there are no shared groups', async () => {
    mockGetSharedGroups.mockResolvedValue([])

    const result = await getFriendExpenses(currentUserId, friendUserId)

    expect(result).toEqual([])
    expect(mockGetGroupExpenses).not.toHaveBeenCalled()
  })
})
