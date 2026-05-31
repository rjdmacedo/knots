fire# Implementation Plan: Activity Tab Fetch Bug

## Overview

This plan fixes the activity tab data fetching bug caused by a missing `'use client'` directive in `page.client.tsx`. The approach follows the exploratory bugfix workflow: first write tests to confirm the bug exists, then write preservation tests to capture baseline behavior, implement the fix, and verify everything passes.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Missing 'use client' Directive Prevents Activity Fetch
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: rendering `ActivityPageClient` without `'use client'` directive causes hooks to fail
  - Create test file at `src/app/groups/[groupId]/activity/__tests__/page.client.test.tsx`
  - Use `@testing-library/react` and `fast-check` to write a property-based test
  - Generate arbitrary group IDs using `fc.string()` and render `ActivityPageClient` in a test environment with mocked tRPC and next-intl providers
  - Assert that `trpc.groups.activities.list.useInfiniteQuery` is invoked on mount (from Bug Condition: `isBugCondition(X) = X.hasUseClientDirective = false`)
  - Assert that `useTranslations('Activity')` executes successfully and returns translation functions
  - The test assertions should match Expected Behavior: `result.trpcQueryFired = true AND result.getRequestMade = true`
  - Run test on UNFIXED code using `npx jest --testPathPattern="page.client.test"`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because hooks cannot execute in a server component context)
  - Document counterexamples found (e.g., "ActivityPageClient renders but useTranslations throws or useInfiniteQuery never fires")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Other Tabs and Infinite Scroll Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file at `src/app/groups/[groupId]/activity/__tests__/preservation.test.tsx`
  - Observe: `ActivityList` component (which already has `'use client'`) correctly calls `useInfiniteQuery` and renders activities when mounted in isolation on unfixed code
  - Observe: Infinite scroll triggers `fetchNextPage` when `inView` becomes true and `hasMore` is true on unfixed code
  - Observe: Loading skeleton (`ActivitiesLoading`) renders when `isLoading` is true on unfixed code
  - Write property-based test using `fast-check`: for all valid group IDs and activity data sets, `ActivityList` correctly groups activities by date and renders them (from Preservation Requirements in design)
  - Write property-based test: for all states where `hasMore = true` and `inView = true`, `fetchNextPage` is called (infinite scroll preservation)
  - Write property-based test: for all states where `isLoading = true`, the loading skeleton is displayed
  - Verify tests pass on UNFIXED code using `npx jest --testPathPattern="preservation.test"`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve - `ActivityList` works correctly in isolation since it has its own `'use client'`)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix for missing 'use client' directive in page.client.tsx
  - [x] 3.1 Implement the fix
    - Add `'use client'` as the very first line of `src/app/groups/[groupId]/activity/page.client.tsx`, before any imports
    - Remove the `metadata` export (`export const metadata: Metadata = { title: 'Activity' }`) and the `import { Metadata } from 'next'` since metadata is a server-only feature and is already correctly defined in `page.tsx`
    - No other changes needed - `ActivityList` already has `'use client'` and tRPC provider is set up in the app layout
    - _Bug_Condition: isBugCondition(X) where X.hasUseClientDirective = false_
    - _Expected_Behavior: renderActivityPage(X with 'use client' added) → result.trpcQueryFired = true AND result.getRequestMade = true_
    - _Preservation: Other tabs, infinite scroll, loading states, and ActivityList internals remain unchanged_
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Activity tRPC Query Fires on Mount
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior: hooks execute and tRPC query fires
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test: `npx jest --testPathPattern="page.client.test"`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed - `'use client'` enables hooks to execute)
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Other Tabs and Infinite Scroll Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests: `npx jest --testPathPattern="preservation.test"`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - ActivityList, infinite scroll, and loading states work identically)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx jest`
  - Verify both property-based tests pass (bug condition and preservation)
  - Verify no type errors: `npx tsc --noEmit`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The project uses TypeScript, Next.js (App Router), Jest, and fast-check (already in devDependencies)
- The bug is deterministic: `page.client.tsx` always lacks `'use client'`, so the property is scoped to this concrete case
- `ActivityList` already has its own `'use client'` directive, so preservation tests can render it in isolation
- The `metadata` export is already defined in `page.tsx` (the server component wrapper), so removing it from `page.client.tsx` causes no loss of functionality
- The fix is minimal: add one directive line and remove one redundant export

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
