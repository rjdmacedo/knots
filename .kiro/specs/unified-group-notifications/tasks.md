# Implementation Plan: Unified Group Notifications

## Overview

Replace the two standalone notification toggles (`EmailNotificationToggle` and `PushNotificationToggle`) with a single `GroupNotificationToggle` popover backed by shared preferences on `GroupMembership`. The implementation proceeds in six sequential layers: schema migration → tRPC API extension → new UI components → group header wiring → email digest upgrade → dead-code and i18n cleanup.

## Tasks

- [x] 1. Schema migration — add shared filter columns to `GroupMembership` and index to `Activity`
  - Run `npx prisma migrate dev --name add-shared-notification-prefs` to generate the migration
  - Add `notifyAllMembers Boolean @default(true)`, `includedUserIds String[] @default([])`, `notifyOnCreate Boolean @default(true)`, `notifyOnUpdate Boolean @default(true)`, `notifyOnDelete Boolean @default(true)` to the `GroupMembership` model in `prisma/schema.prisma`
  - Add `@@index([groupId, time])` to the `Activity` model in `prisma/schema.prisma`
  - Apply the migration with `npx prisma migrate deploy` and regenerate the Prisma client with `npx prisma generate`
  - _Requirements: 10.1_

- [x] 2. Extend the `groupMembership` tRPC router with the unified preference procedures
  - [x] 2.1 Add `getNotificationPreferences` query to `src/trpc/routers/group-membership/index.ts`
    - Single `prisma.groupMembership.findUnique` on `(userId, groupId)` selecting all six fields (`emailNotificationsEnabled`, `notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, `notifyOnDelete`)
    - Throw `FORBIDDEN` if the membership does not exist
    - _Requirements: 10.2_

  - [x] 2.2 Add `setNotificationPreferences` mutation to `src/trpc/routers/group-membership/index.ts`
    - Input: `groupId` + all six preference fields as optional (`z.boolean().optional()` / `z.array(z.string()).optional()`)
    - Single `prisma.groupMembership.update` writing only the provided fields; throw `FORBIDDEN` if membership not found
    - Return the same shape as `getNotificationPreferences`
    - Leave existing `getEmailNotifications` and `setEmailNotifications` procedures untouched and deprecated-in-place — do not remove them (they remain callable until all callers are confirmed migrated)
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 2.3 Write property test for notification preferences round-trip (P4)
    - **Property 4: Notification preferences round-trip**
    - File: `src/trpc/routers/group-membership/__tests__/notification-preferences.property.test.ts`
    - Generate random valid payloads for all six fields; call `setNotificationPreferences` then `getNotificationPreferences`; assert the returned values equal the saved values
    - Mock `prisma.groupMembership.update` and `.findUnique`; use `numRuns: 100`
    - **Validates: Requirements 5.2, 5.3, 10.2, 10.3**

- [x] 3. Add new i18n keys and implement `NotificationSettingsPopover`
  - [x] 3.0 Add new i18n keys to `messages/en-US.json`
    - Under `Notifications`, add: `channelsLabel`, `pushLabel`, `pushUnavailable`, `emailLabel`, `emailHint`, `enableChannelHint`, `pushSyncWarning` with their English strings from the design i18n table
    - Do **not** remove the old keys yet — that happens in task 9.3 alongside component deletion
    - _Requirements: 8.1_

  - [x] 3.1 Create `src/components/notification-settings-popover.tsx` with `ChannelsSection`, `PushChannelRow`, `EmailChannelRow`, `MembersSection`, and `EventsSection`
    - `ChannelsSection` renders a Push row and an Email row; extract push state from `usePushNotificationSubscription`; load all preferences in a single call to `groupMembership.getNotificationPreferences`; if the query fails on mount the email row renders disabled with an error message while the push row and other sections remain functional (partial-load resilience per Req 2.6)
    - `PushChannelRow`: label + Switch; disabled with `pushUnavailable` message when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is absent; disabled with `notSupported` when browser lacks Web Push; disabled with `permissionDenied` when permission denied; loading state while operation in-flight; on enable calls `subscribe(sharedPrefs ?? defaultPushPreferences(userId))`; on disable calls `unsubscribe()`; reverts on error
    - `EmailChannelRow`: label + Switch + `emailHint` sub-text; calls `setNotificationPreferences({ groupId, emailNotificationsEnabled })` on toggle; reverts and shows error toast on mutation failure; disabled with error message when `getNotificationPreferences` query fails on mount
    - `MembersSection` + `EventsSection`: port existing checkbox logic from `src/components/push-notification-toggle.tsx`; all saves call `setNotificationPreferences`; on success sync `PushSubscription` via `updatePreferences` if an active push subscription exists; on `updatePreferences` failure show `pushSyncWarning` toast (auto-dismiss 5 s) but keep the `GroupMembership` save; block save when all event flags are `false` or `notifyAllMembers = false` and `includedUserIds` is empty, showing `selectAtLeastOneFilter` inline
    - Show `enableChannelHint` and hide Members + Events when both channels are disabled
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1–3.9, 4.1–4.8, 5.1–5.8_

  - [x] 3.2 Write property test for filter sections visibility (P2)
    - **Property 2: Filter sections visibility tracks channel state**
    - File: `src/components/__tests__/notification-settings-popover.property.test.tsx`
    - Generate random `(pushEnabled, emailEnabled)` booleans; render `NotificationSettingsPopover` with those channel states mocked; assert Members and Events sections appear iff at least one channel is enabled; `numRuns: 100`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 3.3 Write property test for validation guard (P6)
    - **Property 6: Validation guard blocks invalid filter saves**
    - File: `src/components/__tests__/notification-settings-popover.property.test.tsx`
    - Generate filter states where all three event flags are `false`, or `notifyAllMembers = false` and `includedUserIds = []`; assert no `setNotificationPreferences` mutation is issued and the inline validation message is present; `numRuns: 100`
    - **Validates: Requirements 5.7**

- [x] 4. Implement `GroupNotificationToggle` component
  - [x] 4.1 Create `src/components/group-notification-toggle.tsx`
    - Props: `{ groupId: string; members: Array<{ id: string; name: string }>; currentUserId: string | undefined }`
    - Load preferences via `groupMembership.getNotificationPreferences`; derive push channel state from `usePushNotificationSubscription`
    - Render a `Popover` whose trigger is a `Bell` icon button when at least one channel is enabled, `BellOff` when both are disabled; no VAPID guard — always rendered for group members
    - Render `NotificationSettingsPopover` as the popover content
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 4.2 Write property test for bell icon state (P1)
    - **Property 1: Bell icon reflects channel state**
    - File: `src/components/__tests__/group-notification-toggle.property.test.tsx`
    - Generate random `(pushEnabled, emailEnabled)` booleans; render `GroupNotificationToggle` with mocked hooks; assert `Bell` is rendered when at least one is `true`, `BellOff` when both are `false`; `numRuns: 100`
    - **Validates: Requirements 1.4**

  - [x] 4.3 Write property test for push channel default prefs on first subscribe (P3)
    - **Property 3: Push channel inherits defaults on first subscribe**
    - File: `src/components/__tests__/group-notification-toggle.property.test.tsx`
    - Simulate a member with no saved preferences (all fields at schema defaults); trigger push enable; assert `subscribe` was called with `notifyAllMembers = true`, `includedUserIds = []`, and all event flags `true`; `numRuns: 100`
    - **Validates: Requirements 3.5**

  - [x] 4.4 Write property test for shared filter write-through to `PushSubscription` (P5)
    - **Property 5: Shared filter write-through to PushSubscription**
    - File: `src/components/__tests__/group-notification-toggle.property.test.tsx`
    - Generate random valid `(notifyAllMembers, includedUserIds, notifyOnCreate, notifyOnUpdate, notifyOnDelete)`; simulate an active push subscription; save via `setNotificationPreferences`; assert `updatePreferences` was called with the same five values; `numRuns: 100`
    - **Validates: Requirements 5.5, 7.2**

- [x] 5. Checkpoint — wire and validate the new components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update `group-header.tsx` to use `GroupNotificationToggle`
  - [x] 6.1 Edit `src/app/groups/[groupId]/group-header.tsx`
    - Remove imports of `EmailNotificationToggle` and `PushNotificationToggle`
    - Remove the `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` guard block
    - Add `import { GroupNotificationToggle } from '@/components/group-notification-toggle'`
    - Replace both toggles with `<GroupNotificationToggle groupId={groupId} currentUserId={profile?.id} members={group.participants.map(p => ({ id: p.id, name: p.name }))} />` positioned before `<ShareButton>`
    - _Requirements: 1.1, 1.2, 1.3, 9.3_

- [x] 7. Upgrade `processDueGroupEmailDigests` to apply shared filters
  - [x] 7.1 Update `src/lib/email/group-activity-digest.ts`
    - In `processDueGroupEmailDigests`, after fetching the `pending` row, query `Activity` for all rows where `groupId = pending.groupId AND time >= pending.createdAt AND time < pending.sendAfter`; derive `windowEventTypes` (distinct `activityType` values) and `windowActorIds` (distinct non-null `participantId` values)
    - Change the `GroupMembership` query to exclude members whose `userId` is in `windowActorIds` (replacing the single `userId: { not: pending.lastActorUserId }` filter)
    - Select the five new shared-filter columns (`notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, `notifyOnDelete`) in the membership query
    - Import `isActivityTypeEnabled` from `src/lib/push/subscription-filters`; use it to evaluate each candidate membership against `windowEventTypes`; apply `notifyAllMembers` / `includedUserIds` member filter against `windowActorIds`
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 10.5_

  - [x] 7.2 Write property test — no pending digest row when no qualifying membership exists (P7)
    - **Property 7: No pending digest row when no qualifying membership**
    - File: `src/lib/email/__tests__/group-activity-digest.property.test.ts`
    - Mock `prisma.groupMembership.count` to return `0`; for any `(groupId, actorUserId)`, call `scheduleGroupEmailDigest`; assert `prisma.groupEmailDigestPending.upsert` was never called; `numRuns: 100`
    - **Validates: Requirements 6.1**

  - [x] 7.3 Write property test — email digest eligibility: event-type AND member filters (P8)
    - **Property 8: Email digest recipient eligibility (event-type AND member filters)**
    - File: `src/lib/email/__tests__/group-activity-digest.property.test.ts`
    - Generate random `windowEventTypes`, `windowActorIds`, and membership filter configs; mock DB responses accordingly; run `processDueGroupEmailDigests`; assert the recipient set equals the set of memberships satisfying both `isActivityTypeEnabled` and member-filter criteria (self-exclusion pre-applied at query level); `numRuns: 100`
    - **Validates: Requirements 6.3, 6.4, 6.5**

  - [x] 7.4 Write property test — self-notification exclusion (P9)
    - **Property 9: Self-notification exclusion from email digest**
    - File: `src/lib/email/__tests__/group-activity-digest.property.test.ts`
    - Generate memberships where `userId` is in `windowActorIds`; assert no digest email is sent to those members regardless of filter config; `numRuns: 100`
    - **Validates: Requirements 6.6**

  - [x] 7.5 Write property test — email-disabled members are never recipients (P10)
    - **Property 10: Email-disabled members are never digest recipients**
    - File: `src/lib/email/__tests__/group-activity-digest.property.test.ts`
    - Generate memberships with `emailNotificationsEnabled = false`; for any window and any filter config, assert those members never appear in the send list; `numRuns: 100`
    - **Validates: Requirements 7.4**

- [x] 8. Verify `isActivityTypeEnabled` correctness with property test (P11)
  - [x] 8.1 Write property test for `isActivityTypeEnabled` identity (P11)
    - **Property 11: isActivityTypeEnabled identity**
    - File: `src/lib/push/__tests__/subscription-filters.property.test.ts`
    - Generate any `ActivityType` in `{CREATE_EXPENSE, UPDATE_EXPENSE, UPDATE_GROUP, DELETE_EXPENSE}` and any random boolean triple `(notifyOnCreate, notifyOnUpdate, notifyOnDelete)`; assert the return value is exactly the flag the mapping dictates; `numRuns: 100`
    - **Validates: Requirements 10.5**

- [x] 9. Remove dead code and clean up i18n
  - [x] 9.1 Delete `src/components/email-notification-toggle.tsx`
    - Confirm no remaining imports or JSX usages of `EmailNotificationToggle` exist before deleting (task 6.1 will have already removed the group-header usage)
    - _Requirements: 9.1, 9.2_

  - [x] 9.2 Delete `src/components/push-notification-toggle.tsx` and update affected tests
    - Confirm no remaining imports or JSX usages of `PushNotificationToggle` exist before deleting (task 6.1 will have already removed the group-header usage)
    - Update `src/app/groups/__tests__/ui-button-preservation.property.test.tsx`: remove the `PushNotificationToggle` entry from the component array and replace with a `GroupNotificationToggle` entry that asserts the same popover-opens-on-click behaviour
    - Update `src/app/groups/__tests__/ui-button-tooltip-bug-condition.property.test.tsx`: replace the `PushNotificationToggle` entry with a `GroupNotificationToggle` entry pointing to `src/components/group-notification-toggle.tsx`
    - _Requirements: 9.1, 9.2_

  - [x] 9.3 Remove the five obsolete i18n keys from all locale files
    - Remove `enableEmailNotifications`, `disableEmailNotifications`, `emailEnabledToast`, `emailDisabledToast`, `emailToggleError` from **all** locale files in `messages/` (19 files total including `en-US.json`)
    - _Requirements: 8.3, 9.4_

- [x] 10. Final checkpoint — ensure all tests pass
  - Run `npx jest --forceExit` (skip `migration-multi-payer.property.test.ts` if it hangs — use `--testPathIgnorePatterns` as needed)
  - Run `pnpm check-types` and confirm zero TypeScript errors
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` at `^4.8.0` with `numRuns: 100`; tag format: `// Feature: unified-group-notifications, Property <N>: <property text>`
- The test command is `npx jest --forceExit`; avoid `migration-multi-payer.property.test.ts` (known hang)
- Task 6 (header update) may be done immediately after task 4 once the component exists; tasks 7–8 are independent of tasks 3–6 and can proceed in parallel

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.0"] },
    { "id": 3, "tasks": ["3.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "5"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3", "10"] }
  ]
}
```
