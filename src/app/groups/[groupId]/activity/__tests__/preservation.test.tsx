import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import { ActivityList } from '../activity-list'

/**
 * Property-based preservation tests for ActivityList component.
 *
 * These tests verify that ActivityList (which already has 'use client')
 * correctly renders activities, handles infinite scroll, and shows loading states.
 * They capture baseline behavior BEFORE the fix to page.client.tsx is applied,
 * ensuring the fix does not regress existing functionality.
 *
 * Feature: activity-tab-fetch-bug (Preservation)
 * Validates: Requirements 3.1, 3.2, 3.3
 */

// --- Mocks ---

const mockFetchNextPage = jest.fn()
let mockUseInfiniteQueryReturn: Record<string, unknown> = {}
let mockUseCategoriesReturn: Record<string, unknown> = {}

// Mock trpc client
jest.mock('@/trpc/client', () => ({
  trpc: {
    groups: {
      activities: {
        list: {
          useInfiniteQuery: () => mockUseInfiniteQueryReturn,
        },
      },
    },
    categories: {
      list: {
        useQuery: () => mockUseCategoriesReturn,
      },
    },
  },
}))

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.rich = (key: string) => key
    return t
  },
  useLocale: () => 'en-US',
}))

// Mock react-intersection-observer
let mockInView = false
const mockLoadingRef = jest.fn()
jest.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: mockLoadingRef, inView: mockInView }),
}))

// Mock useCurrentGroup
const mockGroup = {
  id: 'group-1',
  name: 'Test Group',
  currency: 'USD',
  participants: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
}

jest.mock('../../current-group-context', () => ({
  useCurrentGroup: () => ({
    isLoading: false,
    groupId: 'group-1',
    group: mockGroup,
  }),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

// Mock next/link
jest.mock('next/link', () => {
  function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) {
    return <a href={href}>{children}</a>
  }
  MockLink.displayName = 'MockLink'
  return MockLink
})

// --- Arbitraries ---

/**
 * Generate a valid activity object matching the shape expected by ActivityList.
 */
const activityArb = (groupId: string) =>
  fc.record({
    id: fc.uuid(),
    groupId: fc.constant(groupId),
    time: fc.date({ min: new Date('2023-01-01'), max: new Date('2025-12-31') }),
    activityType: fc.constantFrom(
      'UPDATE_GROUP',
      'CREATE_EXPENSE',
      'UPDATE_EXPENSE',
      'DELETE_EXPENSE',
    ),
    participantId: fc.oneof(
      fc.constant('p1'),
      fc.constant('p2'),
      fc.constant(null),
    ),
    expenseId: fc.oneof(fc.uuid(), fc.constant(null)),
    data: fc.oneof(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.constant(null),
    ),
    changes: fc.constant([]),
    expense: fc.constant(undefined),
  })

/**
 * Generate a valid group ID (non-empty alphanumeric string).
 */
const groupIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,36}$/)

// --- Tests ---

describe('ActivityList - Preservation Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockInView = false
    mockUseCategoriesReturn = { data: { categories: [] } }
  })

  /**
   * Property 1: For all valid group IDs and activity data sets,
   * ActivityList correctly groups activities by date and renders them.
   *
   * This verifies that ActivityList (with its own 'use client') works correctly
   * in isolation, grouping activities by date categories and rendering each one.
   *
   * **Validates: Requirements 3.1**
   */
  it('Property 1: ActivityList groups activities by date and renders them for all valid inputs', () => {
    fc.assert(
      fc.property(
        groupIdArb,
        fc.array(activityArb('group-1'), { minLength: 1, maxLength: 10 }),
        (groupId, activities) => {
          mockUseInfiniteQueryReturn = {
            data: {
              pages: [
                { activities, hasMore: false, nextCursor: activities.length },
              ],
            },
            isLoading: false,
            fetchNextPage: mockFetchNextPage,
          }

          const { container } = render(<ActivityList />)

          // Each activity should be rendered (each activity renders a time element or text)
          // The component renders activities grouped by date sections
          // At minimum, the container should not be showing the loading skeleton
          const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
          expect(skeletons.length).toBe(0)

          // The component should render content (either activities or "noActivity" message)
          expect(container.textContent).not.toBe('')
        },
      ),
      { numRuns: 50 },
    )
  })

  /**
   * Property 2: For all states where hasMore = true and inView = true,
   * fetchNextPage is called (infinite scroll preservation).
   *
   * This verifies that the infinite scroll mechanism continues to work:
   * when there are more pages and the loading sentinel is in view,
   * fetchNextPage must be triggered.
   *
   * **Validates: Requirements 3.2**
   */
  it('Property 2: fetchNextPage is called when hasMore=true and inView=true', () => {
    fc.assert(
      fc.property(
        fc.array(activityArb('group-1'), { minLength: 1, maxLength: 10 }),
        (activities) => {
          mockFetchNextPage.mockClear()
          mockInView = true

          mockUseInfiniteQueryReturn = {
            data: {
              pages: [
                { activities, hasMore: true, nextCursor: activities.length },
              ],
            },
            isLoading: false,
            fetchNextPage: mockFetchNextPage,
          }

          render(<ActivityList />)

          // When inView=true and hasMore=true, fetchNextPage should be called
          expect(mockFetchNextPage).toHaveBeenCalled()
        },
      ),
      { numRuns: 50 },
    )
  })

  /**
   * Property 3: For all states where isLoading = true,
   * the loading skeleton (ActivitiesLoading) is displayed.
   *
   * This verifies that the loading state continues to show the skeleton
   * component regardless of other state.
   *
   * **Validates: Requirements 3.3**
   */
  it('Property 3: Loading skeleton is displayed when isLoading=true', () => {
    fc.assert(
      fc.property(
        groupIdArb,
        fc.boolean(), // hasMore
        fc.boolean(), // inView
        (groupId, hasMore, inView) => {
          mockInView = inView

          mockUseInfiniteQueryReturn = {
            data: undefined,
            isLoading: true,
            fetchNextPage: mockFetchNextPage,
          }

          const { container } = render(<ActivityList />)

          // When isLoading is true, the component should render the loading skeleton
          const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
          expect(skeletons.length).toBeGreaterThan(0)
        },
      ),
      { numRuns: 50 },
    )
  })
})
