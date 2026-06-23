# Implementation Plan: Friend Balances Across Groups

## Overview

Implement aggregated friend balances by creating a pure computation module, extending the friends tRPC router, updating the Friends UI, adding a detail page, adding i18n keys to all 19 locale files, and writing unit tests.

## Tasks

- [x] 1. Create friend balances computation module
  - [x] 1.1 Create `src/lib/friend-balances.ts` with types and `getPairwiseBalance`
    - Define `GroupBalanceBreakdown`, `CurrencyBalance`, `FriendBalanceSummary` types
    - Implement `getPairwiseBalance(reimbursements, currentUserId, friendUserId)` using reimbursement from/to flow
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Implement `computeFriendBalance` and `sortFriendBalances` in `src/lib/friend-balances.ts`
    - For each shared group: call `getBalances` → `getSuggestedReimbursements` → `getPairwiseBalance`
    - Group results by currency using `getCurrencyFromGroup` logic
    - Sum totals per currency; include per-group breakdown in response
    - Sort friends: non-zero balances first (by largest absolute amount), then alphabetical by name
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

  - [x] 1.3 Implement `getSharedGroupsForUsers` database helper
    - Query active memberships for both users; return intersection groups
    - Exclude archived memberships
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Unit tests for computation module
  - [x] 2.1 Create `src/lib/friend-balances.test.ts`
    - Test `getPairwiseBalance`: zero when no matching reimbursements, correct sign for owe/owed
    - Test multi-reimbursement netting between two users
    - Test unrelated reimbursements are ignored
    - Test `computeFriendBalance` with multiple groups and currencies (amounts stay separated)
    - Test all-zero and no-shared-groups cases
    - Use mock expense arrays matching `getGroupExpenses` shape (no database)
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 3. Checkpoint — Verify computation module tests pass

- [x] 4. Extend tRPC friends router
  - [x] 4.1 Add `listWithBalances` procedure to `src/trpc/routers/friends/index.ts`
    - Load connected friends via `listFriends`, filter `status === 'connected'` and `friendUserId !== null`
    - For each friend: get shared groups, fetch expenses (cache by groupId within request), compute balances
    - Return sorted `FriendBalanceSummary[]`
    - _Requirements: 3.1, 3.5, 3.6, 6.1, 6.2, 6.3_

  - [x] 4.2 Add `getBalanceDetail` procedure to `src/trpc/routers/friends/index.ts`
    - Input: `{ friendId: string }`
    - Verify friend ownership; return 404 if not found or not owned
    - Require connected friend with `friendUserId`
    - Return friend metadata + full `CurrencyBalance[]` breakdown
    - _Requirements: 5.1, 5.2, 5.6, 6.1, 6.4_

- [x] 5. Add i18n keys to ALL locale files
  - [x] 5.1 Add `Friends.Balances` and `Friends.BalanceDetail` keys to `messages/en-US.json`
    - Use key structure from `design.md`
    - _Requirements: 8.1, 8.4, 8.5_

  - [x] 5.2 Add translated keys to all other 18 locale files
    - Files: `pt-PT`, `pt-BR`, `es`, `ca`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`, `pl-PL`, `cs-CZ`, `ro`, `ru-RU`, `ua-UA`, `tr-TR`, `fi`, `ja-JP`, `zh-CN`, `zh-TW`
    - Use translations from `i18n-translations.md` in this spec folder
    - Verify JSON validity after edits
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 6. Build UI components
  - [x] 6.1 Create `src/app/friends/friend-balance-summary.tsx`
    - Accept `balances: CurrencyBalance[]`, `friendName: string`
    - Render settled / friendOwesYou / youOweFriend states using `Money` component
    - Handle multi-currency display
    - Use `useTranslations('Friends.Balances')`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 8.1, 8.3_

  - [x] 6.2 Update `src/app/friends/friends-management.tsx`
    - Fetch `trpc.friends.listWithBalances.useQuery()` in parallel with `friends.list`
    - Add balance column/section to each connected friend row
    - Link to `/friends/[friendId]/balances` when friend has shared groups
    - Show skeleton for balance while loading; non-blocking error with retry
    - Skip balance for pending / no-account friends
    - _Requirements: 4.1, 4.6, 4.8, 7.1, 7.2_

  - [x] 6.3 Create `src/app/friends/[friendId]/balances/page.tsx` and `friend-balance-detail.tsx`
    - Server page: auth guard, render client detail component
    - Detail: header with friend name, total per currency, group breakdown table/list
    - Each group row links to `/groups/[groupId]/balances`
    - Empty state when no shared groups; back link to `/friends`
    - Loading skeletons and error state with retry
    - Use `useTranslations('Friends.BalanceDetail')`
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 7.4, 8.1_

  - [x] 6.4 Update `src/app/friends/page.tsx` description (optional)
    - Consider updating page description i18n key to mention cross-group balances
    - _Requirements: 8.1_

- [x] 7. Checkpoint — Manual verification
  - Two users in multiple shared groups with mixed currencies
  - Verify balances match group-level Balances tab totals
  - Verify all 19 locale files have complete keys
  - Run `pnpm test` and lint

- [x] 8. Final checkpoint — All tests pass

## Notes

- Amounts are in minor units (cents) throughout; use `Money` / `formatCurrency` for display
- Reuse `getBalances` + `getSuggestedReimbursements` — do not duplicate split-mode math
- Cache `getGroupExpenses(groupId)` results within a single tRPC request when multiple friends share a group
- Phase 2 (dyad groups, cross-group settle-up) is explicitly out of scope

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "5.1", "5.2"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4"] }
  ]
}
```
