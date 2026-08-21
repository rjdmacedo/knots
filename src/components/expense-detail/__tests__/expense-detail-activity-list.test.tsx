import { ActivityType } from '@prisma/client'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

const mockUseInfiniteQuery = jest.fn()
const mockFetchNextPage = jest.fn()
const mockRefetch = jest.fn()

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const t = (key: string) => `${namespace}.${key}`
    t.rich = (key: string) => `${namespace}.${key}`
    return t
  },
  useLocale: () => 'en-US',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}))

jest.mock('@/trpc/client', () => ({
  trpc: {
    groups: {
      activities: {
        list: {
          useInfiniteQuery: (...args: unknown[]) =>
            mockUseInfiniteQuery(...args),
        },
      },
    },
    categories: {
      list: {
        useQuery: () => ({ data: { categories: [] } }),
      },
    },
  },
}))

import { ExpenseActivityList } from '../expense-detail-activity-list'

const group = {
  id: 'group-1',
  name: 'Test Group',
  currency: '$',
  currencyCode: 'USD',
  participants: [
    { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
    { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
  ],
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'activity-1',
    groupId: 'group-1',
    time: new Date('2024-06-15T10:00:00Z'),
    activityType: ActivityType.CREATE_EXPENSE,
    participantId: 'user-1',
    expenseId: 'exp-1',
    data: 'Lunch',
    changes: [],
    expense: { id: 'exp-1', isReimbursement: false },
    ...overrides,
  }
}

describe('ExpenseActivityList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requests activities filtered by the expense id', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: { pages: [{ activities: [], hasMore: false, nextCursor: 0 }] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: false,
    })

    render(
      <ExpenseActivityList groupId="group-1" expenseId="exp-1" group={group} />,
    )

    expect(mockUseInfiniteQuery).toHaveBeenCalledWith(
      { groupId: 'group-1', expenseId: 'exp-1', limit: 20 },
      expect.any(Object),
    )
  })

  it('renders expense activities with compact summaries', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            activities: [
              activity(),
              activity({
                id: 'activity-2',
                activityType: ActivityType.UPDATE_EXPENSE,
                participantId: 'user-2',
                changes: [
                  {
                    field: 'amount',
                    oldValue: '1000',
                    newValue: '2000',
                  },
                ],
              }),
            ],
            hasMore: false,
            nextCursor: 2,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: false,
    })

    render(
      <ExpenseActivityList groupId="group-1" expenseId="exp-1" group={group} />,
    )

    expect(screen.getByText('ExpenseDetail.activity')).toBeInTheDocument()
    expect(
      screen.getByText('Activity.expenseCreatedDetail'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Activity.expenseUpdatedDetail'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /chevron/i }),
    ).not.toBeInTheDocument()
  })

  it('shows an empty state when the expense has no activities', () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: { pages: [{ activities: [], hasMore: false, nextCursor: 0 }] },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: false,
    })

    render(
      <ExpenseActivityList groupId="group-1" expenseId="exp-1" group={group} />,
    )

    expect(screen.getByText('ExpenseDetail.noActivity')).toBeInTheDocument()
  })
})
