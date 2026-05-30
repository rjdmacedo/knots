# Bugfix Requirements Document

## Introduction

When navigating to the "Activity" tab (`/groups/[groupId]/activity`), no GET request is made to fetch the latest activities from the API. The page renders but the tRPC infinite query (`groups.activities.list`) never fires, leaving the user with a perpetual loading state or no data.

The root cause is that `page.client.tsx` is missing the `'use client'` directive. This file uses `useTranslations` (a React hook from `next-intl`) and renders `ActivityList` (which relies on tRPC React Query hooks). Without the directive, Next.js treats the component as a server component, causing hydration failures that prevent client-side hooks — including the tRPC query — from executing.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user navigates to the activity tab THEN the system does not issue a GET request to `/api/trpc/groups.activities.list` and no activities are fetched

1.2 WHEN `page.client.tsx` is rendered without the `'use client'` directive THEN the system fails to execute client-side hooks (`useTranslations`, `useInfiniteQuery`) resulting in the tRPC query never firing

### Expected Behavior (Correct)

2.1 WHEN a user navigates to the activity tab THEN the system SHALL issue a GET request to `/api/trpc/groups.activities.list` and display the fetched activities

2.2 WHEN `page.client.tsx` includes the `'use client'` directive THEN the system SHALL correctly execute all client-side hooks and the tRPC infinite query SHALL fire on mount

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user navigates to other tabs (e.g., expenses, balances) THEN the system SHALL CONTINUE TO fetch and display data correctly via their respective tRPC queries

3.2 WHEN the activity list is loaded and the user scrolls to the bottom THEN the system SHALL CONTINUE TO fetch the next page of activities via infinite scroll

3.3 WHEN the group data is still loading THEN the system SHALL CONTINUE TO display the loading skeleton in the activity list

---

### Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PageClientComponent
  OUTPUT: boolean

  // Returns true when the page.client.tsx file lacks the 'use client' directive
  RETURN X.hasUseClientDirective = false
END FUNCTION
```

### Property Specification

```pascal
// Property: Fix Checking - Activity fetch fires on mount
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderActivityPage(X with 'use client' added)
  ASSERT result.trpcQueryFired = true AND result.getRequestMade = true
END FOR
```

### Preservation Goal

```pascal
// Property: Preservation Checking - Other pages unaffected
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```
