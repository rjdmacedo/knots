# Implementation Plan: Tab Loading States

## Overview

Implementation of visual loading states (skeleton placeholders) in the main content area during page navigation. The approach is incremental: first the skeleton components, then the navigation hook, followed by `loading.tsx` files per route, and finally integration into the existing layout.

## Tasks

- [x] 1. Create reusable skeleton components
  - [x] 1.1 Create `ListSkeleton` component
    - Create file `src/components/skeletons/list-skeleton.tsx`
    - Implement skeleton with vertically stacked items using the existing `Skeleton` component from `src/components/ui/skeleton.tsx`
    - Accept `itemCount` prop (default: 5) for number of items
    - Each item must have `aria-hidden="true"` on decorative elements
    - Container must have descriptive `aria-label` and `data-slot="skeleton"` on each placeholder
    - _Requirements: 2.1, 2.4, 3.1, 5.2_

  - [x] 1.2 Create `CardsSkeleton` component
    - Create file `src/components/skeletons/cards-skeleton.tsx`
    - Implement skeleton with rectangular blocks representing cards using the existing `Skeleton` component
    - Accept `cardCount` prop (default: 3)
    - Apply `aria-hidden="true"` on decorative elements and `data-slot="skeleton"` on each placeholder
    - _Requirements: 2.2, 2.4, 3.1, 5.2_

  - [x] 1.3 Create `ChartsSkeleton` component
    - Create file `src/components/skeletons/charts-skeleton.tsx`
    - Implement skeleton with wide rectangle (chart) and smaller blocks (totals) using the existing `Skeleton` component
    - Apply `aria-hidden="true"` on decorative elements and `data-slot="skeleton"` on each placeholder
    - _Requirements: 2.3, 2.4, 3.1, 5.2_

  - [x] 1.4 Create `GenericSkeleton` component
    - Create file `src/components/skeletons/generic-skeleton.tsx`
    - Implement fallback skeleton with at least 3 line skeletons + 1 block skeleton using the existing `Skeleton` component
    - Apply `aria-hidden="true"` on decorative elements and `data-slot="skeleton"` on each placeholder
    - _Requirements: 2.6, 3.1, 5.2_

  - [x] 1.5 Create `LoadingError` component
    - Create file `src/components/loading-error.tsx`
    - Implement `warning` variant (informative message) and `error` variant (with retry/cancel buttons)
    - Include `aria-live="polite"` for assistive technology announcements
    - _Requirements: 1.4, 5.4, 6.2, 6.3_

  - [x] 1.6 Create `getSkeletonForTab` utility function
    - Create file `src/components/skeletons/get-skeleton-for-tab.ts`
    - Implement tab name to skeleton component mapping
    - Return `GenericSkeleton` for unmapped tabs
    - Export `TabName` type
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]\* 1.7 Write property test: Skeleton composition uses only Skeleton component
    - **Property 1: Skeleton composition uses only Skeleton component**
    - Create file `src/components/skeletons/__tests__/skeleton-composition.property.test.tsx`
    - Generate random tab variants with fast-check, render, verify all placeholder elements have `data-slot="skeleton"`
    - Minimum 100 iterations
    - **Validates: Requirements 3.1**

  - [ ]\* 1.8 Write property test: Accessibility attributes on skeleton variants
    - **Property 3: Accessibility attributes on skeleton variants**
    - Create file `src/components/skeletons/__tests__/skeleton-accessibility.property.test.tsx`
    - Generate random tab variants with fast-check, verify non-empty `aria-label` on container and `aria-hidden="true"` on decorative children
    - Minimum 100 iterations
    - **Validates: Requirements 5.2**

- [x] 2. Checkpoint - Verify skeleton components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement `useNavigationLoading` hook
  - [x] 3.1 Create `useNavigationLoading` hook
    - Create file `src/lib/use-navigation-loading.ts`
    - Implement listening to Next.js router navigation events
    - Integrate `spin-delay` for 200ms debounce (do not show loading on fast navigations)
    - Implement timer management: warning (10s) and error (30s)
    - Implement cancellation of previous navigation when a new one starts
    - Expose `NavigationLoadingState` interface with `isLoading`, `isTimeout`, `isError`, `targetTab`, `cancel()`, `retry()`
    - Ensure cleanup of all timers in `useEffect` cleanup
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.2, 6.2, 6.3_

  - [ ]\* 3.2 Write unit tests for `useNavigationLoading`
    - Create file `src/lib/__tests__/use-navigation-loading.test.ts`
    - Test: spin-delay does not show loading on navigations <200ms
    - Test: timeout warning at 10s
    - Test: timeout error at 30s
    - Test: cancellation of previous navigation
    - Test: timer cleanup on unmount
    - _Requirements: 1.3, 1.4, 4.2, 6.2, 6.3_

  - [ ]\* 3.3 Write property test: Navigation superseding shows only latest skeleton
    - **Property 2: Navigation superseding shows only latest skeleton**
    - Create file `src/lib/__tests__/navigation-superseding.property.test.ts`
    - Generate random sequences of rapid navigations with fast-check, verify only the last skeleton is visible and previous states are cancelled
    - Minimum 100 iterations
    - **Validates: Requirements 4.2**

- [x] 4. Checkpoint - Verify navigation hook
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create `TabLoadingContainer` and `loading.tsx` files
  - [x] 5.1 Create `TabLoadingContainer` component
    - Create file `src/components/tab-loading-container.tsx`
    - Implement wrapper that applies `aria-busy="true"` when loading
    - Remove `aria-busy` when content is ready
    - Render contextual skeleton via `getSkeletonForTab` or content
    - Integrate `LoadingError` for timeout states (warning and error)
    - Ensure `aria-busy` is removed on unmount via `useEffect` cleanup
    - Ensure loading state stays below Progress_Bar in visual hierarchy (z-index)
    - _Requirements: 1.1, 1.2, 5.1, 5.3, 6.4_

  - [x] 5.2 Create `loading.tsx` files for each tab route
    - Create `src/app/groups/[groupId]/expenses/loading.tsx` → export `ListSkeleton`
    - Create `src/app/groups/[groupId]/activity/loading.tsx` → export `ListSkeleton`
    - Create `src/app/groups/[groupId]/balances/loading.tsx` → export `CardsSkeleton`
    - Create `src/app/groups/[groupId]/information/loading.tsx` → export `CardsSkeleton`
    - Create `src/app/groups/[groupId]/stats/loading.tsx` → export `ChartsSkeleton`
    - _Requirements: 2.1, 2.2, 2.3, 3.3_

- [x] 6. Integration into existing layout
  - [x] 6.1 Integrate `TabLoadingContainer` in `GroupLayoutClient`
    - Modify `src/app/groups/[groupId]/layout.client.tsx`
    - Wrap `{children}` with `TabLoadingContainer`
    - Pass loading state from `useNavigationLoading` hook and active tab
    - Ensure header and navigation remain visible and in original positions during loading
    - Ensure tabs remain clickable with the same visual style during loading (not disabled, not dimmed)
    - _Requirements: 3.3, 4.1, 4.3_

  - [ ]\* 6.2 Write integration tests for tab loading states
    - Create file `src/app/groups/[groupId]/__tests__/tab-loading-states.test.tsx`
    - Test: aria-busy lifecycle (added at start, removed at end)
    - Test: navigation remains interactive during loading
    - Test: header/nav stability during loading
    - Test: correct skeleton is rendered for each tab
    - Test: loading state does not overlap progress bar
    - _Requirements: 4.1, 4.3, 5.1, 5.3, 3.3, 6.4_

- [x] 7. Fix tsc and prettier
  - Run `npx tsc --noEmit` and fix any TypeScript compilation errors in the new/modified files
  - Run `npx prettier --write` on all new/modified files to ensure formatting compliance
  - Files to check: `src/components/skeletons/*.tsx`, `src/components/skeletons/*.ts`, `src/components/loading-error.tsx`, `src/components/tab-loading-container.tsx`, `src/lib/use-navigation-loading.ts`, `src/app/groups/[groupId]/layout.client.tsx`, `src/app/groups/[groupId]/*/loading.tsx`

- [x] 8. Final checkpoint - Verify complete integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The project already has `spin-delay` and `fast-check` installed — no need to add dependencies
- The existing `Skeleton` component in `src/components/ui/skeleton.tsx` is the base for all skeletons

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "3.1"] },
    { "id": 2, "tasks": ["1.7", "1.8", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["7"] },
    { "id": 7, "tasks": ["8"] }
  ]
}
```
