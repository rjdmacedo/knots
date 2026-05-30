# Implementation Plan: Activity Changes UI

## Overview

This plan implements field-level change display in the activity feed. The approach starts with the pure formatting utility (easily testable), adds i18n keys, builds the ChangeList component, integrates it into the existing ActivityItem/ActivityList components, and validates with property-based and unit tests.

## Tasks

- [x] 1. Create value formatting utility module

  - [x] 1.1 Create `src/app/groups/[groupId]/activity/format-change-value.ts` with `formatFieldValue` and `getFieldLabel` functions

    - Implement `getFieldLabel(field, t)` mapping known fields to translation keys, returning raw field name for unknowns
    - Implement `formatFieldValue(field, value, context)` with formatting rules: amount as currency, expenseDate as localized date, isReimbursement as Yes/No, paidBy/paidFor as resolved participant names, category as resolved category name, all others as raw string
    - Handle error cases gracefully: invalid dates return raw string, missing participant/category IDs return raw ID, invalid JSON in paidFor returns raw string
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 1.2 Write property tests for `formatFieldValue` and `getFieldLabel`
    - **Property 3: Unknown field names display as-is**
    - **Property 4: Value formatting correctness by field type**
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.3**
    - Create test file at `src/app/groups/[groupId]/activity/__tests__/format-change-value.test.ts`
    - Use fast-check to generate random unknown field names and verify identity return
    - Use fast-check to generate valid amounts, dates, participant IDs, category IDs, and booleans and verify correct formatting

- [x] 2. Add i18n translation keys

  - [x] 2.1 Add Activity change field labels and toggle text to `messages/en-US.json`
    - Add keys under "Activity" namespace for all 14 field labels: title, amount, expenseDate, category, paidBy, splitMode, isReimbursement, notes, recurrenceRule, paidFor, name, information, currency, participants
    - Add toggle control keys: "showMoreChanges" with `{count}` parameter (ICU MessageFormat), "showLess" static key
    - Add boolean display keys: "yes", "no"
    - Add aria-label key: "fieldChangesCount" with `{count}` parameter
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 3. Create ChangeList component

  - [x] 3.1 Create `src/app/groups/[groupId]/activity/change-list.tsx` with ChangeList and ChangeListItem components

    - Implement ChangeListProps interface accepting changes array, groupCurrency, participants, and categories
    - Filter out changes where both oldValue and newValue are null
    - Manage collapsed/expanded state with useState, default collapsed when changes exceed threshold (3)
    - Render semantic `<ul>` with aria-label indicating total change count
    - Render each change as `<li>` with pattern: "Label: oldFormatted → newFormatted"
    - Include visually hidden "from" / "to" text for screen readers
    - Handle null oldValue (addition) and null newValue (removal) display patterns
    - Render collapse toggle `<button>` with aria-expanded, calling event.stopPropagation()
    - Use text-xs and text-muted-foreground for visual styling, with left padding for hierarchy
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 3.2 Write property tests for ChangeList filtering and collapsing logic

    - **Property 1: Change rendering preserves order and structure**
    - **Property 2: Both-null changes are filtered from output**
    - **Property 5: Collapse behavior for lists exceeding threshold**
    - **Property 6: No toggle for lists at or below threshold**
    - **Property 7: Accessible change count in aria-label**
    - **Validates: Requirements 1.3, 1.6, 2.4, 4.1, 4.2, 4.6, 7.3**
    - Create test file at `src/app/groups/[groupId]/activity/__tests__/change-list.test.tsx`
    - Use fast-check to generate random FieldChange arrays and verify order, filtering, collapse threshold, and aria-label count

  - [x] 3.3 Write unit tests for ChangeList component
    - Test renders nothing when changes array is empty
    - Test renders semantic HTML structure (ul > li)
    - Test displays arrow separator (→) between old and new values
    - Test shows only new value when oldValue is null
    - Test shows only old value when newValue is null
    - Test toggle click does not trigger parent navigation (stopPropagation)
    - Test toggle updates aria-expanded attribute
    - Test visually hidden "from"/"to" text is present for screen readers
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.3, 5.6, 7.1, 7.4, 7.5_

- [x] 4. Integrate ChangeList into ActivityItem and ActivityList

  - [x] 4.1 Modify `src/app/groups/[groupId]/activity/activity-list.tsx` to fetch categories and pass them down

    - Add `trpc.categories.list.useQuery()` call in ActivityList
    - Pass `categories` prop to each ActivityItem
    - _Requirements: 3.5_

  - [x] 4.2 Modify `src/app/groups/[groupId]/activity/activity-item.tsx` to render ChangeList
    - Accept `categories` as a new prop
    - Import and render `<ChangeList>` below the summary div when `activity.changes` has entries
    - Pass groupCurrency, participants (from useCurrentGroup), categories, and changes to ChangeList
    - Ensure click-to-navigate behavior still works on the ChangeList area (excluding toggle)
    - _Requirements: 1.1, 1.2, 5.5, 5.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript, Next.js, Jest, and fast-check (already in devDependencies)
- All new components are co-located in the existing `src/app/groups/[groupId]/activity/` directory

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2"] }
  ]
}
```
