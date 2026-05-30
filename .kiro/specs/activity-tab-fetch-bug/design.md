# Activity Tab Fetch Bug - Bugfix Design

## Overview

The activity tab at `/groups/[groupId]/activity` fails to fetch data because `page.client.tsx` is missing the `'use client'` directive. Without this directive, Next.js treats the component as a server component, which prevents React hooks (`useTranslations`, and indirectly `useInfiniteQuery` via `ActivityList`) from executing on the client. The fix is to add the `'use client'` directive at the top of `page.client.tsx`, consistent with how other client layout/page files in the project (e.g., `layout.client.tsx`) are structured.

## Glossary

- **Bug_Condition (C)**: The absence of the `'use client'` directive in `page.client.tsx`, causing Next.js to treat it as a server component
- **Property (P)**: When the activity tab is opened, the tRPC infinite query (`groups.activities.list`) fires and activities are fetched and displayed
- **Preservation**: All other tabs, infinite scroll behavior, and loading states must remain unchanged by the fix
- **page.client.tsx**: The file at `src/app/groups/[groupId]/activity/page.client.tsx` that exports `ActivityPageClient`, the client-side wrapper for the activity page
- **ActivityList**: The component in `activity-list.tsx` that uses `trpc.groups.activities.list.useInfiniteQuery` to fetch and render activities
- **'use client' directive**: A Next.js/React directive placed at the top of a file to mark it as a Client Component, enabling hooks and browser APIs

## Bug Details

### Bug Condition

The bug manifests when a user navigates to the activity tab. The `page.client.tsx` file uses `useTranslations` (a React hook) and renders `ActivityList` (which uses tRPC React Query hooks), but lacks the `'use client'` directive. Next.js therefore treats it as a server component, causing hydration failures that prevent client-side hooks from executing.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type FileModule (page.client.tsx)
  OUTPUT: boolean

  RETURN input.firstDirective != "'use client'"
         AND input.usesReactHooks = true
END FUNCTION
```

### Examples

- **Example 1**: User clicks "Activity" tab → `page.client.tsx` renders without `'use client'` → `useTranslations` fails silently or throws hydration error → `ActivityList` never mounts properly → tRPC query never fires → perpetual loading state
- **Example 2**: User navigates directly to `/groups/abc123/activity` → same failure path → no GET request to `/api/trpc/groups.activities.list`
- **Example 3**: Compare with `layout.client.tsx` which has `'use client'` at line 1 → its `trpc.groups.get.useQuery` fires correctly → group data loads
- **Edge case**: If `ActivityList` (which has its own `'use client'`) is rendered in isolation, its hooks work. The bug is specifically in the parent `page.client.tsx` lacking the directive, causing the entire component tree rooted there to be treated as server-rendered.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Mouse/touch navigation to other tabs (expenses, balances, settings) must continue to fetch and display their respective data
- Infinite scroll in the activity list must continue to fetch subsequent pages when the user scrolls to the bottom
- Loading skeleton must continue to display while group data or activities are being fetched
- The `ActivityList` component's internal logic (date grouping, pagination, category fetching) must remain unchanged
- The `layout.client.tsx` group data fetching must remain unaffected

**Scope:**
All inputs that do NOT involve the `page.client.tsx` file's directive should be completely unaffected by this fix. This includes:

- All other page and layout files in the application
- The tRPC router and procedure definitions
- The `ActivityList` component internals (already has `'use client'`)
- Server-side rendering of the `page.tsx` wrapper

## Hypothesized Root Cause

Based on the bug description, the most likely issue is:

1. **Missing `'use client'` Directive**: The file `page.client.tsx` uses React hooks (`useTranslations` from `next-intl`) but does not declare itself as a client component. In Next.js App Router, any file that uses hooks must either have `'use client'` at the top or be imported by a file that does.

2. **Naming Convention Mismatch**: The file is named `page.client.tsx` (suggesting it's a client component by convention), but Next.js does not infer the `'use client'` boundary from file names — it requires the explicit directive.

3. **Cascading Failure**: Because `page.client.tsx` is treated as a server component, `useTranslations` either throws during SSR or produces a hydration mismatch. This prevents the component tree from mounting correctly on the client, which in turn prevents `ActivityList`'s `useInfiniteQuery` from ever executing.

4. **Silent Failure Mode**: Unlike a hard crash, the hydration mismatch may result in a silent failure where the page renders the static shell but hooks never activate, leaving the user in a perpetual loading state.

## Correctness Properties

Property 1: Bug Condition - Activity tRPC Query Fires on Mount

_For any_ rendering of the activity page where `page.client.tsx` includes the `'use client'` directive, the `ActivityList` component SHALL mount as a client component and the `trpc.groups.activities.list.useInfiniteQuery` hook SHALL fire, issuing a GET request to `/api/trpc/groups.activities.list` and displaying fetched activities.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Other Tabs and Existing Behavior Unchanged

_For any_ navigation or interaction that does NOT involve the activity page's client directive (other tabs, infinite scroll, loading states), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for non-activity-page interactions.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/groups/[groupId]/activity/page.client.tsx`

**Function**: Module-level (file directive)

**Specific Changes**:

1. **Add `'use client'` directive**: Insert `'use client'` as the very first line of `page.client.tsx`, before any imports. This is the only change required.

2. **Remove `metadata` export**: The file currently exports `metadata` (a server-only feature in Next.js App Router). Since adding `'use client'` makes this a client component, the `metadata` export must be removed from this file. It is already correctly defined in `page.tsx` (the server component wrapper), so no functionality is lost.

3. **No other changes needed**: The `ActivityList` component already has `'use client'` and its hooks are correctly implemented. The tRPC provider is already set up in the app's layout. The fix is purely about marking the boundary correctly.

**Expected Result After Fix**:

```typescript
'use client'

import { ActivityList } from '@/app/groups/[groupId]/activity/activity-list'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export function ActivityPageClient() {
  const t = useTranslations('Activity')

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <ActivityList />
        </CardContent>
      </Card>
    </>
  )
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render the `ActivityPageClient` component and assert that the tRPC query is invoked. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:

1. **Hook Execution Test**: Render `ActivityPageClient` in a test environment and verify `useTranslations` is called (will fail or produce hydration error on unfixed code)
2. **tRPC Query Fire Test**: Render the activity page and assert that `trpc.groups.activities.list.useInfiniteQuery` is invoked (will fail on unfixed code)
3. **Network Request Test**: Mount the activity page and verify a GET request is made to the activities endpoint (will fail on unfixed code)
4. **Hydration Test**: Server-render then hydrate the component and check for hydration mismatches (will produce warnings/errors on unfixed code)

**Expected Counterexamples**:

- `useTranslations` throws or returns undefined when called in a server component context
- `useInfiniteQuery` never fires because the component tree doesn't hydrate as a client component
- Possible causes: missing `'use client'` directive causing server component treatment

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderActivityPage(input with 'use client' added)
  ASSERT result.trpcQueryFired = true
  ASSERT result.getRequestMade = true
  ASSERT result.activitiesDisplayed = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for other tabs and interactions, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Other Tab Navigation Preservation**: Verify that navigating to expenses/balances tabs continues to fetch data correctly after the fix
2. **Infinite Scroll Preservation**: Verify that scrolling to the bottom of the activity list still triggers `fetchNextPage` after the fix
3. **Loading State Preservation**: Verify that the loading skeleton displays correctly while data is being fetched
4. **Group Context Preservation**: Verify that `useCurrentGroup` continues to provide group data correctly

### Unit Tests

- Test that `ActivityPageClient` renders without errors when `'use client'` is present
- Test that `useTranslations` is called with the correct namespace ('Activity')
- Test that `ActivityList` is rendered as a child component
- Test that removing the `metadata` export does not affect page behavior

### Property-Based Tests

- Generate random group IDs and verify the activity page renders and fires the tRPC query
- Generate random activity data sets and verify they display correctly after the fix
- Test that all non-activity routes continue to function identically before and after the fix

### Integration Tests

- Test full navigation flow: land on group page → click Activity tab → verify activities load
- Test that switching between tabs (Activity → Expenses → Activity) correctly fetches data each time
- Test that infinite scroll works end-to-end after the fix is applied
