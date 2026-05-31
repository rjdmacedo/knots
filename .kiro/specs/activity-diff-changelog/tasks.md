# Implementation Plan: Activity Diff Changelog

## Overview

Implement field-level change tracking (diffs) for the existing Activity system. This adds a new `ActivityChange` Prisma model, a diff engine for computing field-level differences on expenses and groups, enhances `logActivity` to persist changes, integrates diff logging into expense/group operations, and updates activity querying to include change records.

## Tasks

- [x] 1. Set up ActivityChange Prisma model and migration
  - [x] 1.1 Add `ActivityChange` model to `prisma/schema.prisma` with fields: `id` (String, @id, @default(cuid())), `activityId` (String), `field` (String), `oldValue` (String?), `newValue` (String?), relation to Activity with onDelete: Cascade, and @@index([activityId])
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.2 Add `changes ActivityChange[]` relation field to the existing `Activity` model
    - _Requirements: 1.3_
  - [x] 1.3 Generate and apply the Prisma migration (`npx prisma migrate dev --name add-activity-changes`)
    - _Requirements: 1.5_
  - [x] 1.4 Verify the generated migration SQL creates the table, foreign key, and index correctly
    - _Requirements: 1.1, 1.4, 1.5_

- [x] 2. Implement expense diff engine
  - [x] 2.1 Create `src/lib/activity-diff.ts` with the `FieldChange` interface: `{ field: string; oldValue: string | null; newValue: string | null }`
    - _Requirements: 2.1, 2.3_
  - [x] 2.2 Implement `computeExpenseChanges(existing, updated)` function that compares tracked expense fields: title, amount, expenseDate, category, paidBy, splitMode, isReimbursement, notes, recurrenceRule, paidFor
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 2.3 Handle value serialization: convert numbers to strings, dates to ISO strings, arrays to JSON, and null/undefined to null
    - _Requirements: 2.3, 2.6_
  - [x] 2.4 Ensure unchanged fields produce no FieldChange entries and identical states return an empty array
    - _Requirements: 2.4, 2.5_
  - [x] 2.5 Write property test for expense diff completeness
    - **Property 1: Diff completeness** — For every tracked field where oldValue !== newValue, exactly one FieldChange entry exists in the result
    - **Property 2: Diff soundness** — Every FieldChange in the result corresponds to a field where old and new values genuinely differ
    - **Validates: Requirements 2.4, 2.5**
  - [x] 2.6 Write property test for idempotent comparison
    - **Property 5: Idempotent comparison** — `computeExpenseChanges(expense, toFormValues(expense))` returns an empty array
    - **Validates: Requirements 2.5**

- [x] 3. Implement group diff engine
  - [x] 3.1 Add `computeGroupChanges(existing, updated)` function to `src/lib/activity-diff.ts`
    - Track changes to group fields: name, information, currency, participants
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Serialize participant changes as comma-separated name lists (old names vs new names)
    - _Requirements: 3.3_
  - [x] 3.3 Ensure unchanged group fields produce no FieldChange entries
    - _Requirements: 3.4_
  - [x] 3.4 Write unit tests for group diff engine
    - Test participant list changes, name changes, currency changes
    - Test that identical inputs return empty array
    - _Requirements: 3.4_

- [x] 4. Checkpoint - Verify diff engines
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Enhance logActivity to persist changes
  - [x] 5.1 Update the `logActivity` function signature in `src/lib/api.ts` to accept optional `changes?: FieldChange[]` in the `extra` parameter
    - Import `FieldChange` type from `src/lib/activity-diff.ts`
    - _Requirements: 4.1, 4.4_
  - [x] 5.2 When `changes` is provided and non-empty, use Prisma nested `createMany` to insert ActivityChange records alongside the Activity
    - _Requirements: 4.2_
  - [x] 5.3 When `changes` is undefined or empty, maintain existing behavior (no ActivityChange records created)
    - _Requirements: 4.3_
  - [x] 5.4 Write unit tests for logActivity changes persistence
    - Test that providing changes creates correct number of ActivityChange records
    - Test backward compatibility when no changes provided
    - **Validates: Requirements 4.2, 4.3**

- [x] 6. Integrate diff logging into expense operations
  - [x] 6.1 In `updateExpense`: call `computeExpenseChanges(existingExpense, expenseFormValues)` and pass the result to `logActivity`
    - _Requirements: 5.1_
  - [x] 6.2 In `createExpense`: construct initial FieldChange entries (oldValue=null) for title, amount, paidBy and pass to `logActivity`
    - _Requirements: 5.2_
  - [x] 6.3 In `deleteExpense`: construct final FieldChange entries (newValue=null) for title, amount and pass to `logActivity`
    - _Requirements: 5.3_
  - [x] 6.4 Verify all existing logActivity call sites still compile and work without changes
    - _Requirements: 5.4_

- [x] 7. Integrate diff logging into group operations
  - [x] 7.1 In `updateGroup`: call `computeGroupChanges(existingGroup, groupFormValues)` and pass the result to `logActivity`
    - Import `computeGroupChanges` from `src/lib/activity-diff.ts`
    - _Requirements: 6.1, 6.2_

- [x] 8. Enhance getActivities to include changes
  - [x] 8.1 Update the `getActivities` function to include `changes` in the Prisma query (add `include: { changes: true }` or equivalent select)
    - _Requirements: 7.1, 7.3_
  - [x] 8.2 Update the return type to include `changes` array on each activity
    - Ensure older activities without changes return an empty `changes` array (not null/undefined)
    - _Requirements: 7.1, 7.2_
  - [x] 8.3 Write integration tests for activity querying with changes
    - Test that activities include their associated changes
    - Test that older activities return empty changes array
    - **Validates: Requirements 7.1, 7.2**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Tasks 1.1–1.4 (Prisma model/migration) and 2.1, 2.3 (FieldChange type and serialization) are already completed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 4, "tasks": ["2.4", "3.2"] },
    { "id": 5, "tasks": ["2.5", "2.6", "3.3"] },
    { "id": 6, "tasks": ["3.4", "5.1"] },
    { "id": 7, "tasks": ["5.2", "5.3"] },
    { "id": 8, "tasks": ["5.4", "6.1", "6.2", "6.3", "7.1"] },
    { "id": 9, "tasks": ["6.4", "8.1"] },
    { "id": 10, "tasks": ["8.2"] },
    { "id": 11, "tasks": ["8.3"] }
  ]
}
```
