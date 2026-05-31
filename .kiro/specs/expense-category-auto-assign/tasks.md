# Implementation Plan: Expense Category Auto-Assign

## Overview

Implementation of a title-category association memory system for expenses within a group. The system stores mappings (normalized title → category) scoped per group, and auto-fills the category in future expense creations with the same title, with priority over AI extraction.

## Tasks

- [x] 1. Create data model and Prisma migration

  - [x] 1.1 Add `ExpenseCategoryMapping` model to Prisma schema and create migration
    - Add the `ExpenseCategoryMapping` model in `prisma/schema.prisma` with fields: `id` (cuid), `groupId`, `normalizedTitle`, `categoryId`, `updatedAt`, `createdAt`
    - Add composite unique constraint `@@unique([groupId, normalizedTitle])`
    - Add index `@@index([groupId, normalizedTitle])` for efficient lookups
    - Configure relation with `Group` (onDelete: Cascade) and `Category`
    - Add `categoryMappings ExpenseCategoryMapping[]` field to `Group` and `Category` models
    - Generate migration with `npx prisma migrate dev --name add_expense_category_mapping`
    - _Requirements: 1.1, 4.1, 4.4_

- [x] 2. Implement CategoryMappingService (business logic)

  - [x] 2.1 Create `src/lib/category-mapping.ts` module with `normalizeTitle`, `upsertCategoryMapping`, and `lookupCategoryMapping` functions

    - Implement `normalizeTitle(title: string): string` — converts to lowercase, trims, collapses internal spaces
    - Implement `upsertCategoryMapping({ groupId, title, categoryId, isReimbursement })` — performs atomic mapping upsert, with guards for short title (<2 chars) and reimbursement
    - Implement `lookupCategoryMapping({ groupId, title })` — queries mapping and validates that the category still exists before returning
    - Use Prisma `upsert` with unique constraint `(groupId, normalizedTitle)` for atomic operation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.4, 3.1, 3.4, 6.1, 6.3_

  - [ ]\* 2.2 Write property test for `normalizeTitle` (Property 3)

    - **Property 3: normalizeTitle idempotence and correctness**
    - **Validates: Requirements 1.3**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify idempotence: `normalizeTitle(normalizeTitle(x)) === normalizeTitle(x)`
    - Verify result: lowercase only, no leading/trailing spaces, no consecutive internal spaces

  - [ ]\* 2.3 Write property test for short title guard (Property 4)

    - **Property 4: Short title guard**
    - **Validates: Requirements 1.4**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that titles with normalization < 2 chars do not create/update mappings

  - [ ]\* 2.4 Write property test for reimbursement guard (Property 5)

    - **Property 5: Reimbursement guard**
    - **Validates: Requirements 2.4, 6.1, 6.3**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that expenses with `isReimbursement=true` never create/update mappings

  - [ ]\* 2.5 Write property test for upsert last-write-wins (Property 1)

    - **Property 1: Upsert last-write-wins**
    - **Validates: Requirements 1.1, 1.2, 2.1, 6.4**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that after multiple upserts, the mapping always reflects the latest categoryId

  - [ ]\* 2.6 Write property test for group isolation (Property 7)
    - **Property 7: Group isolation**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that upsert in one group does not affect lookup in another group

- [x] 3. Checkpoint - Verify business logic

  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create tRPC lookup procedure

  - [x] 4.1 Create `src/trpc/routers/groups/expenses/lookup-category.procedure.ts` and register in router
    - Create `lookupCategoryMappingProcedure` with input `{ groupId: string, title: string }` and output `{ categoryId: number | null }`
    - Call `lookupCategoryMapping` from CategoryMappingService
    - Register the new procedure in `src/trpc/routers/groups/expenses/index.ts` as `lookupCategory`
    - _Requirements: 3.1, 3.4, 5.1_

- [x] 5. Integrate upsert in expense create and update procedures

  - [x] 5.1 Modify `src/trpc/routers/groups/expenses/create.procedure.ts` to call `upsertCategoryMapping` after successful creation

    - Extract `title`, `categoryId`, and `isReimbursement` from `expenseFormValues`
    - Call `upsertCategoryMapping` after successful `createExpense`, inside try/catch (failure does not block main operation)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1_

  - [x] 5.2 Modify `src/trpc/routers/groups/expenses/update.procedure.ts` to call `upsertCategoryMapping` after successful update

    - Extract `title`, `categoryId`, and `isReimbursement` from `expenseFormValues`
    - Call `upsertCategoryMapping` after successful `updateExpense`, inside try/catch (failure does not block main operation)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.2, 6.3_

  - [ ]\* 5.3 Write property test for title change preserves old mapping (Property 2)

    - **Property 2: Title change preserves old mapping**
    - **Validates: Requirements 2.2, 2.3**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that when changing title from A to B, the mapping for A remains unchanged

  - [ ]\* 5.4 Write unit tests for procedure integration
    - Test that upsert failure does not block expense create/edit
    - Test that reimbursement does not trigger upsert
    - _Requirements: 1.1, 2.4, 6.1_

- [x] 6. Checkpoint - Verify backend integration

  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate lookup in frontend form

  - [x] 7.1 Modify `src/app/groups/[groupId]/expenses/expense-form.tsx` to query mapping on title `onBlur`

    - In the `title` field `onBlur` handler, before AI extraction, call `lookupCategoryMappingProcedure` via tRPC
    - If it returns a non-null `categoryId`, fill the category field with `form.setValue('category', categoryId)` and return (without calling AI)
    - If it returns `null`, keep current behavior (fallback to AI if enabled, or default category)
    - Handle lookup errors silently (fallback to existing behavior)
    - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_

  - [ ]\* 7.2 Write property test for lookup round-trip with category validation (Property 6)

    - **Property 6: Lookup round-trip with category validity**
    - **Validates: Requirements 3.1, 3.4**
    - File: `src/lib/category-mapping.property.test.ts`
    - Verify that lookup returns correct categoryId when category exists, and null when it does not

  - [ ]\* 7.3 Write unit tests for priority flow in the form
    - Test that mapping takes priority over AI
    - Test fallback to AI when no mapping exists
    - Test fallback to default category when AI is disabled and no mapping exists
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 8. Final checkpoint - Verify complete integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- The mapping operation is secondary — failures never block expense create/edit
- The project already uses `fast-check` v4.8.0 and the property test pattern is in `src/lib/activity-diff.property.test.ts`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3"] }
  ]
}
```
