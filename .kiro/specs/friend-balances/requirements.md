# Requirements Document

## Introduction

Knots currently tracks expenses and balances **per group**. The Friends page is a social contact list used to add people to groups quickly, but it does not show how much each friend owes or is owed across all shared groups.

This feature adds **aggregated friend balances**: for each connected friend, the user sees their net balance summed across every non-archived group where both are members. Balances are broken down by currency (never converted) and by group on a detail view.

This is Phase 1 only. It does **not** introduce a new expense model, cross-group reimbursements, or automatic dyad (1-on-1) group creation.

## Glossary

- **Friend**: A contact in the user's friends list (`Friend` model). The `Friend` model stores `id`, `userId`, `email`, `friendUserId` (nullable), `name` (nullable), and `createdAt`. There is no `status` column; connection status is computed at the application layer.
- **Connected_Friend**: A Friend record where `friendUserId` is not null AND a reciprocal Friend record exists (the linked user also has a Friend record pointing back to the owner). This is determined by `enrichFriendsWithStatus()` in `src/lib/friends.ts`. Only Connected Friends participate in balance aggregation.
- **Pending_Friend**: A Friend record that is NOT connected — either `friendUserId` is null (the invitee has no account) or no reciprocal Friend record exists yet.
- **Shared_Group**: A group where both the current user and a Connected Friend's `friendUserId` have an active (non-archived) `GroupMembership`.
- **Pairwise_Balance**: The net amount between two users in a single group, derived from suggested reimbursements. Positive means the friend owes the current user; negative means the current user owes the friend.
- **Aggregated_Balance**: The sum of Pairwise_Balance values for one friend across all Shared_Groups, grouped by currency code.
- **Balance_Procedure**: The tRPC server procedure that computes aggregated friend balances.
- **Friends_Dashboard**: The Friends page at `/friends`, extended to show balance summaries per friend.
- **Friend_Balance_Detail**: A detail view at `/friends/[friendId]/balances` showing per-group breakdown.
- **Seed_Script**: The Prisma seed script (`prisma/seed.ts`) that populates the local development database with representative test data.

## Requirements

### Requirement 1: Compute Pairwise Balance in a Group

**User Story:** As a developer, I want a pure function that extracts the net balance between two users in a group, so that aggregation logic is testable and consistent with existing group balances.

#### Acceptance Criteria

1. THE Balance_Engine SHALL reuse `getBalances()` and `getSuggestedReimbursements()` from `src/lib/balances.ts` on a group's expense list.
2. THE Balance_Engine SHALL compute Pairwise_Balance by summing reimbursement flows between the two user IDs: amounts where `from` is the friend and `to` is the current user add to the balance; amounts where `from` is the current user and `to` is the friend subtract from the balance.
3. IF no reimbursement exists between the two users in a group, THEN THE Balance_Engine SHALL return a Pairwise_Balance of zero for that group.
4. THE Balance_Engine SHALL include all expenses (including reimbursements) when computing balances, matching the existing group Balances tab behavior.

### Requirement 2: Find Shared Groups Between User and Friend

**User Story:** As a user, I want balances computed only from groups we both belong to, so that unrelated groups do not affect my friend balance.

#### Acceptance Criteria

1. THE Balance_Procedure SHALL find Shared_Groups by querying `GroupMembership` where both the current user and the friend's `friendUserId` are members with `archivedAt` null.
2. THE Balance_Procedure SHALL exclude groups where either user is not a member.
3. THE Balance_Procedure SHALL exclude archived memberships (`archivedAt` is not null).

### Requirement 3: Aggregate Balances Per Friend

**User Story:** As a user, I want to see my total balance with each connected friend across all shared groups, so that I know who owes me and whom I owe without checking each group individually.

#### Acceptance Criteria

1. WHEN the Balance_Procedure runs for the current user, IT SHALL compute Aggregated_Balance for every Connected_Friend (Friend records where `friendUserId` is not null AND a reciprocal Friend record exists).
2. THE Balance_Procedure SHALL group Aggregated_Balance amounts by the group's `currencyCode` (falling back to the group's `currency` symbol when `currencyCode` is null, using existing `getCurrencyFromGroup` logic).
3. THE Balance_Procedure SHALL NOT convert amounts between currencies; each currency is reported separately.
4. FOR each friend and currency, THE Balance_Procedure SHALL include a list of Shared_Groups with their individual Pairwise_Balance and group metadata (id, name, currency).
5. IF a connected friend has no Shared_Groups, THEN THE Balance_Procedure SHALL return an empty balance list for that friend (not omit the friend from the response if the friend appears in the friends list endpoint).
6. THE Balance_Procedure SHALL sort friends with non-zero balances first (by absolute total in the user's preferred currency if available, otherwise by largest absolute amount in any currency), then alphabetically by name.

### Requirement 4: Friends List Balance Summary

**User Story:** As a user, I want to see each friend's balance on the Friends page, so that I can quickly scan who owes what.

#### Acceptance Criteria

1. WHEN the Friends_Dashboard loads, IT SHALL fetch aggregated balances via a new tRPC query (`friends.listWithBalances` or equivalent).
2. THE Friends_Dashboard SHALL display each connected friend with their Aggregated_Balance per currency using the existing `Money` component with `colored={true}`.
3. WHEN a friend's balance is positive, THE Friends_Dashboard SHALL indicate the friend owes the user (use i18n string, e.g. "{name} owes you {amount}").
4. WHEN a friend's balance is negative, THE Friends_Dashboard SHALL indicate the user owes the friend (use i18n string, e.g. "You owe {name} {amount}").
5. WHEN a friend's balance is zero across all shared groups, THE Friends_Dashboard SHALL display a settled/neutral state (e.g. "All settled up").
6. WHEN a friend is a Pending_Friend (no reciprocal Friend record exists or `friendUserId` is null), THE Friends_Dashboard SHALL NOT display a balance (show existing status badge only).
7. WHEN a connected friend has multiple currencies, THE Friends_Dashboard SHALL display each currency balance on a separate line or comma-separated, never summed into one number.
8. THE Friends_Dashboard SHALL link each friend row (or a "View details" action) to the Friend_Balance_Detail page when they have at least one Shared_Group.

### Requirement 5: Friend Balance Detail View

**User Story:** As a user, I want to see how my balance with a friend breaks down by group, so that I can navigate to the relevant group to settle up.

#### Acceptance Criteria

1. THE Friend_Balance_Detail page SHALL be accessible at `/friends/[friendId]/balances` where `friendId` is the `Friend.id` (not `friendUserId`).
2. THE Friend_Balance_Detail page SHALL verify the friend belongs to the current user; IF not, IT SHALL return 404.
3. THE Friend_Balance_Detail page SHALL display the friend's name, total Aggregated_Balance per currency, and a list of Shared_Groups with Pairwise_Balance per group.
4. FOR each group row, THE Friend_Balance_Detail page SHALL link to that group's Balances tab (`/groups/[groupId]/balances`).
5. WHEN the friend has no Shared_Groups, THE Friend_Balance_Detail page SHALL display an empty state explaining that balances appear once both users share a group.
6. WHEN the friend is a Pending_Friend, THE Friend_Balance_Detail page SHALL redirect to `/friends` or show an appropriate message.

### Requirement 6: API and Authorization

**User Story:** As a developer, I want balance endpoints to be authenticated and scoped to the current user, so that users cannot read other users' friend balances.

#### Acceptance Criteria

1. ALL new tRPC procedures SHALL use `protectedProcedure`.
2. THE Balance_Procedure SHALL only return data for friends owned by the authenticated user (`Friend.userId === ctx.user.id`).
3. THE Balance_Procedure SHALL only include groups where the authenticated user is a member.
4. THE detail endpoint SHALL validate `friendId` ownership before returning data.

### Requirement 7: Loading, Error, and Empty States

**User Story:** As a user, I want clear feedback while balances load or when something fails, so that I understand the page state.

#### Acceptance Criteria

1. WHILE balance data is loading, THE Friends_Dashboard SHALL show skeleton placeholders in the balance column without blocking the existing friends list from rendering (balances may load independently).
2. IF the balance query fails, THE Friends_Dashboard SHALL display a non-blocking error message with a retry action; the friends list SHALL remain usable.
3. IF the user has no connected friends with shared groups, THE Friends_Dashboard MAY omit the balance section or show an informational empty state.
4. THE Friend_Balance_Detail page SHALL follow existing loading patterns (`Skeleton`, `useSpinDelay` where appropriate).

### Requirement 8: Internationalization

**User Story:** As a user browsing in my language, I want all new balance labels and messages translated, so that the experience matches the rest of the app.

#### Acceptance Criteria

1. ALL user-facing strings in the Friends balance feature SHALL use `next-intl` translation keys under the `Friends.Balances` namespace (and `Friends.BalanceDetail` for the detail page).
2. NO hardcoded user-visible strings SHALL appear in component source files.
3. Monetary values SHALL be formatted via the existing `formatCurrency` / `Money` component using the group's currency and the user's locale.
4. Translation keys SHALL be added to **every** locale file in the `messages/` directory (19 files — see design document for the full list).
5. Non-English locales SHALL receive proper translations (not English placeholders). Use `en-US.json` as the source of truth for key structure.

### Requirement 9: Testing

**User Story:** As a developer, I want automated tests for balance computation, so that aggregation logic remains correct as the codebase evolves.

#### Acceptance Criteria

1. THE Balance_Engine SHALL have unit tests in `src/lib/friend-balances.test.ts` covering: zero balance, single reimbursement between two users, multiple reimbursements netting out, and exclusion of unrelated users' reimbursements.
2. THE Balance_Engine SHALL have unit tests for multi-currency aggregation (amounts stay separated by currency).
3. Tests SHALL NOT require a database; computation functions SHALL be pure and accept expense arrays matching `getGroupExpenses` return shape.

### Requirement 10: Database Seeder Creates Friend Records

**User Story:** As a developer, I want the Prisma seed script to create Friend records between seed users, so that I can locally test the friend-balances feature without manual database setup.

#### Acceptance Criteria

1. WHEN the Seed_Script runs, IT SHALL create Friend records for all pairs of seed users (Rafael, Alice, Bob).
2. THE Seed_Script SHALL create reciprocal Friend records for each connected pair: for users A and B, a Friend record owned by A referencing B AND a Friend record owned by B referencing A.
3. FOR each reciprocal Friend record, THE Seed_Script SHALL set `friendUserId` to the referenced user's `id` and `email` to the referenced user's email address.
4. THE Seed_Script SHALL create at least one non-reciprocal Friend record (only one direction) to represent a Pending_Friend state for testing the non-connected scenario.
5. WHEN the Seed_Script completes, THE connected Friend pairs SHALL resolve to `connected` status via the existing `getConnectedInviteeUserIds` logic (both users have Friend records pointing at each other).
6. THE Seed_Script SHALL delete existing Friend records (via `prisma.friend.deleteMany()`) during the cleanup phase before creating new seed data.
7. THE Seed_Script SHALL log the number of Friend records created and indicate which friendships are connected versus pending.
