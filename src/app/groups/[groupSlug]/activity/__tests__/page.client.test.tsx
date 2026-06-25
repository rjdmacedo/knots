import { render } from '@testing-library/react'
import fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Bug Condition Exploration Test - Property 1: Missing 'use client' Directive Prevents Activity Fetch
 *
 * This test verifies the expected behavior: when ActivityPageClient renders,
 * useTranslations('Activity') executes successfully and ActivityList mounts
 * (which triggers trpc.groups.activities.list.useInfiniteQuery).
 *
 * The bug condition is: isBugCondition(X) = X.hasUseClientDirective = false
 * When the directive is missing, Next.js treats the component as a server component,
 * preventing client-side hooks from executing.
 *
 * On UNFIXED code (missing 'use client' directive), this test is EXPECTED TO FAIL
 * because the file lacks the required directive for hooks to work in production.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 */

// Track hook invocations
const mockUseTranslations = jest.fn()
const mockUseInfiniteQuery = jest.fn()

// Mock next-intl to track useTranslations calls
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    mockUseTranslations(namespace)
    return (key: string) => `${namespace}.${key}`
  },
}))

// Mock the tRPC client to track useInfiniteQuery calls
jest.mock('@/trpc/client', () => ({
  trpc: {
    groups: {
      activities: {
        list: {
          useInfiniteQuery: (...args: unknown[]) => {
            mockUseInfiniteQuery(...args)
            return {
              data: {
                pages: [{ activities: [], hasMore: false, nextCursor: null }],
              },
              isLoading: false,
              fetchNextPage: jest.fn(),
            }
          },
        },
      },
    },
    categories: {
      list: {
        useQuery: () => ({
          data: { categories: [] },
        }),
      },
    },
  },
}))

// Mock the current group context
jest.mock('@/app/groups/[groupSlug]/current-group-context', () => ({
  useCurrentGroup: () => ({
    isLoading: false,
    groupId: 'test-group-id',
    group: { participants: [] },
  }),
}))

// Mock react-intersection-observer
jest.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: jest.fn(), inView: false }),
}))

// Import AFTER mocks are set up
import { ActivityPageClient } from '../page.client'

// Path to the source file under test
const PAGE_CLIENT_PATH = path.resolve(__dirname, '../page.client.tsx')

describe('ActivityPageClient - Bug Condition Exploration', () => {
  beforeEach(() => {
    mockUseTranslations.mockClear()
    mockUseInfiniteQuery.mockClear()
  })

  /**
   * Property 1: Bug Condition - Missing 'use client' Directive Prevents Activity Fetch
   *
   * For any arbitrary group ID, rendering ActivityPageClient SHALL:
   * 1. Have the 'use client' directive at the top of the file (prerequisite for hooks)
   * 2. Execute useTranslations('Activity') successfully
   * 3. Trigger trpc.groups.activities.list.useInfiniteQuery on mount
   *
   * The bug condition is formally defined as:
   *   isBugCondition(X) = X.hasUseClientDirective = false
   *
   * When this condition is true (directive missing), Next.js treats the file as a
   * server component, and hooks (useTranslations, useInfiniteQuery) cannot execute.
   *
   * Expected: result.trpcQueryFired = true AND result.getRequestMade = true
   * This requires: hasUseClientDirective = true (the fix)
   *
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   */
  it('Property 1: page.client.tsx has use client directive AND hooks fire on render', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (_groupId) => {
        // PART 1: Verify the 'use client' directive exists in the source file
        // This is the core bug condition check: isBugCondition(X) = X.hasUseClientDirective = false
        // The file MUST have 'use client' as its first directive for hooks to work in Next.js
        const fileContent = fs.readFileSync(PAGE_CLIENT_PATH, 'utf-8')
        const firstLine = fileContent.split('\n')[0].trim()

        // Assert the directive is present - this will FAIL on unfixed code
        expect(firstLine).toMatch(/^['"]use client['"]$/)

        // PART 2: Verify hooks execute when the component renders
        mockUseTranslations.mockClear()
        mockUseInfiniteQuery.mockClear()

        const { unmount } = render(<ActivityPageClient />)

        // Assert useTranslations('Activity') was called
        expect(mockUseTranslations).toHaveBeenCalledWith('Activity')

        // Assert trpc.groups.activities.list.useInfiniteQuery was invoked on mount
        expect(mockUseInfiniteQuery).toHaveBeenCalled()

        unmount()
      }),
      { numRuns: 50 },
    )
  })

  /**
   * Property 1b: useTranslations returns working translation functions
   *
   * For any arbitrary group ID, the translation function returned by
   * useTranslations('Activity') SHALL produce string outputs for known keys,
   * AND the source file must declare itself as a client component.
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  it('Property 1b: use client directive enables functional translation output', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (_groupId) => {
        // Verify the file declares itself as a client component
        const fileContent = fs.readFileSync(PAGE_CLIENT_PATH, 'utf-8')
        const lines = fileContent.split('\n')
        const hasUseClientDirective = lines.some(
          (line) =>
            line.trim() === "'use client'" || line.trim() === '"use client"',
        )

        // This assertion encodes the bug condition - will FAIL on unfixed code
        expect(hasUseClientDirective).toBe(true)

        // When the directive is present, hooks work and translations render
        mockUseTranslations.mockClear()
        const { container, unmount } = render(<ActivityPageClient />)

        expect(container.textContent).toContain('Activity.title')
        expect(container.textContent).toContain('Activity.description')
        expect(mockUseTranslations).toHaveBeenCalledWith('Activity')

        unmount()
      }),
      { numRuns: 50 },
    )
  })
})
