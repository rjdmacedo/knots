  # Implementation Plan: User Profile and Participants

## Overview

This plan migrates the expense system from the standalone `Participant` model to direct `User` references via `GroupMembership`, and adds user profile management (password change, display name update). The migration is the most complex piece — it re-points all expense FK columns from Participant to User in a single Prisma migration. Profile features are straightforward tRPC mutations.

## Tasks

- [x] 1. Profile service and tRPC router
  - [x] 1.1 Create the profile service module
    - Create `src/lib/profile/profile-service.ts` with `changeName` and `changePassword` functions
    - `changeName`: trim input, validate length (1–100 chars after trim), update `User.name` in DB
    - `changePassword`: verify current password with bcrypt, validate new password via `validatePassword`, reject same-password, hash new password, update `User.passwordHash`, delete all other sessions for the user
    - Define `ProfileError` type with codes: `INVALID_NAME`, `CURRENT_PASSWORD_MISMATCH`, `SAME_PASSWORD`, `INVALID_PASSWORD`
    - Use existing `hashPassword`, `verifyPassword` from `src/lib/auth/password.ts` and `validatePassword` from `src/lib/auth/password-validation.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3_

  - [ ]* 1.2 Write property tests for password change logic
    - **Property 7: Password change updates hash correctly**
    - **Property 8: Incorrect current password rejection**
    - **Property 10: Same-password rejection**
    - **Property 11: Session invalidation on password change**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5**

  - [ ]* 1.3 Write property tests for name change logic
    - **Property 12: Name update persistence with trimming**
    - **Property 13: Name length validation**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 1.4 Write property test for password validation
    - **Property 9: Password validation correctness**
    - **Validates: Requirements 4.3**

  - [x] 1.5 Create the profile tRPC router
    - Create `src/trpc/routers/profile/index.ts` with `getProfile`, `changeName`, and `changePassword` procedures
    - All procedures use `protectedProcedure` from `src/trpc/init.ts`
    - Define Zod input schemas: `changeNameSchema` (name string), `changePasswordSchema` (currentPassword, newPassword)
    - Wire the router into `src/trpc/routers/_app.ts` as `profile: profileRouter`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Profile settings page
  - [x] 3.1 Create the profile settings page
    - Create `src/app/groups/settings/page.tsx` as a Server Component that fetches user profile via `profile.getProfile`
    - Display current name and email (read-only for email)
    - Include `NameChangeForm` and `PasswordChangeForm` client components
    - Page must be accessible only to authenticated users (redirect to login if unauthenticated)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.2 Implement the NameChangeForm client component
    - Create `src/app/groups/settings/name-change-form.tsx`
    - Use shadcn/ui form components with react-hook-form and Zod validation
    - Call `profile.changeName` mutation on submit
    - Show success toast on success, display error message on failure
    - _Requirements: 5.1, 6.3, 6.5, 6.6_

  - [x] 3.3 Implement the PasswordChangeForm client component
    - Create `src/app/groups/settings/password-change-form.tsx`
    - Fields: current password, new password, confirm new password
    - Use shadcn/ui form components with react-hook-form and Zod validation (client-side uses `validatePassword`)
    - Call `profile.changePassword` mutation on submit
    - Show success toast on success, display specific error messages on failure (mismatch, same password, invalid password)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.4, 6.5, 6.6_

  - [ ]* 3.4 Write unit tests for profile settings page
    - Test that the page renders name and email
    - Test that success/error toasts display correctly
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Database migration: Participant → User
  - [x] 5.1 Create the Prisma migration SQL
    - Create a new Prisma migration in `prisma/migrations/` that performs the full Participant → User migration
    - Step 1: Add nullable `paidByUserId` column to `Expense` and `userId` column to `ExpensePaidFor`
    - Step 2: Backfill data — match Participant to User via `GroupMembership` join on `groupId` + `User.name = Participant.name`
    - Step 3: For any unmatched Participants, create placeholder User records (with generated email and empty passwordHash) and corresponding GroupMembership records, then backfill their references
    - Step 4: Set new columns as NOT NULL, add FK constraints referencing `User(id)` with ON DELETE CASCADE
    - Step 5: Drop old `paidById` FK column from `Expense`, drop old `participantId` FK column from `ExpensePaidFor`
    - Step 6: Rename `paidByUserId` → `paidById` on `Expense`, rename `userId` → `participantId` on `ExpensePaidFor` (or use final column names per design — adjust to match the design schema which uses `userId` on ExpensePaidFor)
    - Step 7: Drop the `Participant` table
    - Step 8: Add relation indexes on new FK columns
    - Note: In production, 2 groups with 2 users (Rafael Macedo, Ana Ferreira) are already migrated — name-based matching will work
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 5.2 Update the Prisma schema to reflect post-migration state
    - Remove the `Participant` model entirely
    - Update `Expense` model: `paidBy` relation points to `User` with relation name `"ExpensesPaidBy"`
    - Update `ExpensePaidFor` model: replace `participant`/`participantId` with `user`/`userId` referencing `User` with relation name `"ExpensesPaidFor"`
    - Add reverse relations on `User` model: `expensesPaidBy Expense[]` and `expensesPaidFor ExpensePaidFor[]`
    - Remove `participants Participant[]` from `Group` model
    - Update `ExpensePaidFor` `@@id` to `[expenseId, userId]`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 5.3 Write property tests for migration logic
    - **Property 3: Migration correctly maps participants to users and updates all references**
    - **Property 4: Migration preserves expense data integrity**
    - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update group and expense logic to use User references
  - [x] 7.1 Update group queries to return members from GroupMembership
    - Modify `src/trpc/routers/groups/get.procedure.ts` to return group members via `GroupMembership` → `User` instead of `Participant`
    - Update `src/trpc/routers/groups/getDetails.procedure.ts` similarly
    - Ensure the response shape includes `{ id, name, email }` for each member
    - Update any `include: { participants: true }` to `include: { memberships: { include: { user: true } } }`
    - _Requirements: 1.3, 3.1_

  - [x] 7.2 Update expense creation to validate GroupMembership
    - Modify `src/trpc/routers/groups/expenses/create.procedure.ts` to use `protectedProcedure` instead of `baseProcedure`
    - Validate that `paidBy` user and all `paidFor` users hold active `GroupMembership` in the target group before creating the expense
    - Replace `participantId` parameter with the authenticated user's ID from context
    - Update `src/lib/api.ts` (or wherever `createExpense` is defined) to write User IDs instead of Participant IDs
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 7.3 Update expense update and delete procedures
    - Modify `src/trpc/routers/groups/expenses/update.procedure.ts` to validate GroupMembership for paidBy/paidFor users
    - Ensure expense queries return User data instead of Participant data
    - Update `src/trpc/routers/groups/expenses/get.procedure.ts` and `list.procedure.ts` to join on User instead of Participant
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ]* 7.4 Write property tests for group membership queries and expense validation
    - **Property 1: Group participants query returns exactly membership users**
    - **Property 2: Expense creation rejects non-members**
    - **Validates: Requirements 1.3, 1.5**

- [x] 8. Update group form to remove participant management
  - [x] 8.1 Update the group form schema and components
    - Remove the `participants` array from `groupFormSchema` in `src/lib/schemas.ts` (and the `superRefine` for duplicate names)
    - Update `src/app/groups/create/` page to remove participant name inputs
    - Update `src/app/groups/[groupId]/edit/` page to remove participant name inputs
    - Display current group members (from GroupMembership) as a read-only list in the edit form
    - _Requirements: 3.1, 3.2_

  - [x] 8.2 Update group creation to auto-add creator as first member
    - Modify `src/trpc/routers/groups/create.procedure.ts` to use `protectedProcedure`
    - After creating the group, create a `GroupMembership` record linking the authenticated user to the new group
    - Remove any logic that creates `Participant` records during group creation
    - _Requirements: 3.3_

  - [ ]* 8.3 Write property test for group creator automatic membership
    - **Property 6: Group creator automatic membership**
    - **Validates: Requirements 3.3**

- [x] 9. Update expense form to show group members
  - [x] 9.1 Update expense form participant selection
    - Modify the expense creation/edit forms to fetch and display group members (Users with GroupMembership) as selectable paidBy and paidFor options
    - Replace any Participant-based dropdowns/selectors with User-based ones (showing `user.name`)
    - Update the `expenseFormSchema` if needed — the `paidBy` and `paidFor[].participant` fields now reference User IDs
    - _Requirements: 3.4_

  - [ ]* 9.2 Write unit tests for expense form member selection
    - Test that only group members appear as selectable options
    - Test that non-members cannot be selected
    - _Requirements: 3.4_

- [x] 10. Update balances and statistics to use User references
  - [x] 10.1 Update balance calculations
    - Modify `src/trpc/routers/groups/balances/` to compute balances using User IDs instead of Participant IDs
    - Update any balance display components to show User names
    - _Requirements: 1.1, 1.2_

  - [x] 10.2 Update statistics and activity queries
    - Modify `src/trpc/routers/groups/stats/` to use User references
    - Update `src/trpc/routers/groups/activities/` to reference Users instead of Participants
    - Update activity logging in expense create/update/delete to use User ID
    - _Requirements: 1.1, 1.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The migration (task 5.1) is the highest-risk task — test thoroughly against a local DB before deploying
- In production, name-based matching will correctly map Rafael Macedo and Ana Ferreira across 2 groups
- The `Participant` model is fully removed after migration — no dual-model period

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["7.4", "8.2", "9.1"] },
    { "id": 7, "tasks": ["8.3", "9.2", "10.1"] },
    { "id": 8, "tasks": ["10.2"] }
  ]
}
```
