# Design Document: Unified Group Notifications

## Overview

This feature merges the two independent notification controls in the group header — `EmailNotificationToggle` and `PushNotificationToggle` — into a single `GroupNotificationToggle` component backed by a `NotificationSettingsPopover`. The popover surfaces three logical sections: **Channels** (push on/off, email on/off), **Members** (who to follow), and **Events** (which activity types to receive). Member and event filter selections become _shared preferences_ stored on `GroupMembership` and kept in sync with the per-device `PushSubscription` row.

The feature adds five new columns to `GroupMembership`, introduces two new tRPC procedures (`getNotificationPreferences` / `setNotificationPreferences`), upgrades the email digest scheduler to apply the shared filters at send time, and deletes the now-redundant `EmailNotificationToggle` component.

Key design decisions:

- **Source of truth for filters lives on `GroupMembership`**, not on `PushSubscription`. Push dispatch continues to read from `PushSubscription` unchanged; the new popover writes to both on every save.
- **The toggle is always rendered** when the user is a group member, regardless of VAPID configuration. Email delivery does not require push keys.
- **The digest scheduler evaluates eligibility at send time** by querying the `Activity` table for the relevant window, since a single `GroupEmailDigestPending` row does not record which event types or actors were involved.

---

## Architecture

The change touches four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (Client)                                                    │
│  src/components/group-notification-toggle.tsx                   │
│    └── src/components/notification-settings-popover.tsx         │
│          ├── ChannelsSection (PushChannelRow, EmailChannelRow)  │
│          ├── MembersSection                                      │
│          └── EventsSection                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ tRPC
┌────────────────────────▼────────────────────────────────────────┐
│  API (tRPC Router: src/trpc/routers/group-membership/index.ts)  │
│  + getNotificationPreferences                                    │
│  + setNotificationPreferences                                    │
│  (existing) getEmailNotifications / setEmailNotifications kept  │
│  (existing) pushSubscriptions.create / delete (unchanged)       │
└────────────────────────┬────────────────────────────────────────┘
                         │ Prisma
┌────────────────────────▼────────────────────────────────────────┐
│  Database                                                       │
│  GroupMembership  +5 columns (notifyAllMembers, includedUserIds,│
│                   notifyOnCreate, notifyOnUpdate, notifyOnDelete)│
│  Activity  +@@index([groupId, time]) for window queries         │
│  PushSubscription  unchanged schema                             │
│  GroupEmailDigestPending  unchanged schema                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  Server-side services                                           │
│  src/lib/email/group-activity-digest.ts  upgraded filter logic  │
│  src/lib/push/subscription-filters.ts   isActivityTypeEnabled   │
│  src/lib/push/notify-on-activity.ts     unchanged               │
└─────────────────────────────────────────────────────────────────┘
```

The client has **no new network dependencies** — all new state is loaded via the existing `getNotificationPreferences` query (one round-trip at popover mount) and saved via `setNotificationPreferences` (one write per user interaction).

---

## Components and Interfaces

### `GroupNotificationToggle`

**File:** `src/components/group-notification-toggle.tsx`

Replaces both `EmailNotificationToggle` and `PushNotificationToggle` in `group-header.tsx`. Renders a Popover trigger button with a `Bell` icon (at least one channel enabled) or `BellOff` icon (no channels enabled). No VAPID guard — rendered for all authenticated group members.

```tsx
interface GroupNotificationToggleProps {
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}
```

### `NotificationSettingsPopover`

**File:** `src/components/notification-settings-popover.tsx`

Popover content panel. Receives the same props as the toggle plus the loaded preference state. Renders three sub-sections; when no channel is enabled, hides Members and Events and shows a hint.

Internal structure:

```
NotificationSettingsPopover
  ├── ChannelsSection
  │     ├── PushChannelRow   (reuses usePushNotificationSubscription hook)
  │     └── EmailChannelRow
  ├── (conditional) MembersSection
  └── (conditional) EventsSection
```

### `PushChannelRow`

A row with a label, a Switch, and an optional disabled reason string. Disabled states:

- VAPID key absent → `pushUnavailable` message
- Browser does not support Web Push → `notSupported` message
- Permission denied → `permissionDenied` message
- Loading → spinner, switch disabled

On enable: calls `usePushNotificationSubscription.subscribe(sharedPrefs)` where `sharedPrefs` comes from the currently loaded `GroupMembership` preferences (or defaults if none exist).
On disable: calls `usePushNotificationSubscription.unsubscribe()`.

### `EmailChannelRow`

A row with a label, a Switch, and a "after 5 quiet minutes" hint. Calls `groupMembership.setNotificationPreferences({ groupId, emailNotificationsEnabled: <bool> })` (the new unified mutation — the email toggle uses the same procedure as filter saves). Reflects `emailNotificationsEnabled` from `getNotificationPreferences`.

On error: reverts optimistic state and shows error toast.

### `MembersSection` / `EventsSection`

Extracted from the existing `PushNotificationToggle` body. All state changes call `groupMembership.setNotificationPreferences` (new mutation). On success: syncs `PushSubscription` row if the current device has an active subscription (via `usePushNotificationSubscription.updatePreferences`).

Validation: at least one event type and at least one member selector must be active before save; invalid state shows inline message and blocks the save.

### `usePushNotificationSubscription` hook

Unchanged. `GroupNotificationToggle` passes the shared preferences from `GroupMembership` when calling `subscribe()` so the new `PushSubscription` row inherits the correct filter values from day one.

### Updated `src/app/groups/[groupId]/group-header.tsx`

Removes import and usage of both `EmailNotificationToggle` and `PushNotificationToggle` (and the `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` guard). Adds `GroupNotificationToggle` positioned before `ShareButton`.

---

## Data Models

### Schema changes — `GroupMembership`

```prisma
model GroupMembership {
  // ... existing fields unchanged ...

  /// When true, the member receives a debounced email digest after group activity.
  emailNotificationsEnabled Boolean  @default(false)

  // --- New shared notification filter fields ---
  /// When true, notify about activity by any member (excluding self).
  notifyAllMembers          Boolean  @default(true)
  /// Used when notifyAllMembers = false. Only notify about activity by these user IDs.
  includedUserIds           String[] @default([])
  /// Notify when an expense is created.
  notifyOnCreate            Boolean  @default(true)
  /// Notify when an expense or group settings are updated.
  notifyOnUpdate            Boolean  @default(true)
  /// Notify when an expense is deleted.
  notifyOnDelete            Boolean  @default(true)
}
```

Migration strategy: `prisma migrate dev` with `@default(...)` values — existing rows receive the defaults without any manual backfill. This is fully backward-compatible.

### Schema changes — `Activity` index

`processDueGroupEmailDigests` queries `Activity` with `WHERE groupId = ? AND time >= ? AND time < ?`. The `Activity` model currently has no index on `(groupId, time)`. The same migration that adds the `GroupMembership` columns SHALL also add:

```prisma
model Activity {
  // ... existing fields unchanged ...

  @@index([groupId, time])  // added for digest window queries
}
```

Without this index the scheduler query degrades to a full table scan as the `Activity` table grows.

### `PushSubscription` — no schema changes

The five filter fields (`notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, `notifyOnDelete`) remain on `PushSubscription`. The new popover writes them via `updatePreferences` whenever the member saves filter changes. `dispatchNotifications` continues to read from `PushSubscription` exclusively.

### `ActivityType` → event-flag mapping (single source of truth)

The mapping already lives in `src/lib/push/subscription-filters.ts` as `isActivityTypeEnabled`. The email digest path will import and reuse this function rather than duplicating the mapping.

```
ActivityType.CREATE_EXPENSE          → notifyOnCreate
ActivityType.UPDATE_EXPENSE          → notifyOnUpdate
ActivityType.UPDATE_GROUP            → notifyOnUpdate
ActivityType.DELETE_EXPENSE          → notifyOnDelete
```

### New tRPC procedures

**`groupMembership.getNotificationPreferences`**

```ts
input:  { groupId: string }
output: {
  emailNotificationsEnabled: boolean
  notifyAllMembers: boolean
  includedUserIds: string[]
  notifyOnCreate: boolean
  notifyOnUpdate: boolean
  notifyOnDelete: boolean
}
```

Single Prisma read on `GroupMembership` by `(userId, groupId)`.

**`groupMembership.setNotificationPreferences`**

```ts
input: {
  groupId: string
  emailNotificationsEnabled?: boolean
  notifyAllMembers?: boolean
  includedUserIds?: string[]
  notifyOnCreate?: boolean
  notifyOnUpdate?: boolean
  notifyOnDelete?: boolean
}
output: { /* same shape as getNotificationPreferences output */ }
```

Single `prisma.groupMembership.update` with only the provided fields. Partial input allows the email toggle to call a single mutation without coupling to filter field updates.

The existing `getEmailNotifications` / `setEmailNotifications` procedures remain available for the duration of the transition period.

### Updated `scheduleGroupEmailDigest`

The coarse pre-filter query changes to check that at least one non-actor membership with `emailNotificationsEnabled = true` exists; the five new filter fields are not evaluated here (they are applied at send time). This matches the current implementation — only the column name is new.

### Updated `processDueGroupEmailDigests`

For each `GroupEmailDigestPending` row:

1. Query `Activity` for all rows where `groupId = pending.groupId` and `time >= pending.createdAt` and `time < pending.sendAfter` (the `@@index([groupId, time])` on `Activity` makes this efficient). Collect:
   - `windowEventTypes`: the set of distinct `activityType` values across all matching rows.
   - `windowActorIds`: the set of distinct non-null `participantId` values. Activities with `participantId = null` are skipped for actor-set purposes but their `activityType` still contributes to `windowEventTypes`.

2. Query `GroupMembership` where `groupId = pending.groupId`, `emailNotificationsEnabled = true`, `archivedAt = null`, `userId NOT IN windowActorIds`.

3. For each candidate membership, evaluate eligibility:
   - At least one `activityType` in `windowEventTypes` must map to a `true` event flag on the membership (using `isActivityTypeEnabled` from `src/lib/push/subscription-filters.ts`).
   - If `notifyAllMembers = false`, at least one user ID in `windowActorIds` must appear in `includedUserIds`.

4. Send digest emails only to eligible members whose `user.emailVerified != null` and `user.email` is non-empty.

5. Delete the `GroupEmailDigestPending` row regardless (even if zero recipients — silent cleanup).

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: Bell icon reflects channel state

_For any_ combination of push-enabled and email-enabled boolean values, the `GroupNotificationToggle` button SHALL render a `Bell` icon if at least one channel is enabled, and a `BellOff` icon if both channels are disabled.

**Validates: Requirements 1.4**

---

### Property 2: Filter sections visibility tracks channel state

_For any_ combination of push-enabled and email-enabled boolean values, the `NotificationSettingsPopover` SHALL show the Members and Events filter sections if and only if at least one channel is enabled; when both channels are disabled both filter sections SHALL be absent from the rendered output.

**Validates: Requirements 2.4, 2.5**

---

### Property 3: Push channel inherits defaults on first subscribe

_For any_ group member who has no prior shared filter preferences persisted on `GroupMembership` (i.e. all filter fields are at their schema defaults), when they enable the Push channel, the resulting `PushSubscription` row SHALL have `notifyAllMembers = true`, `includedUserIds = []`, `notifyOnCreate = true`, `notifyOnUpdate = true`, and `notifyOnDelete = true`.

**Validates: Requirements 3.5**

---

### Property 4: Notification preferences round-trip

_For any_ valid notification preference payload `(notifyAllMembers, includedUserIds, notifyOnCreate, notifyOnUpdate, notifyOnDelete, emailNotificationsEnabled)` saved via `setNotificationPreferences`, a subsequent call to `getNotificationPreferences` for the same member and group SHALL return identical values for all six fields.

**Validates: Requirements 5.2, 5.3, 10.2, 10.3**

---

### Property 5: Shared filter write-through to PushSubscription

_For any_ valid combination of `(notifyAllMembers, includedUserIds, notifyOnCreate, notifyOnUpdate, notifyOnDelete)` values saved via `setNotificationPreferences`, if the current device has an active `PushSubscription` row for that group, the five filter fields on that `PushSubscription` row SHALL equal the saved values after the operation completes.

**Validates: Requirements 5.5, 7.2**

---

### Property 6: Validation guard blocks invalid filter saves

_For any_ filter state where all three event flags are `false`, or where `notifyAllMembers = false` and `includedUserIds` is empty, attempting to save via `setNotificationPreferences` SHALL be blocked — no mutation SHALL be issued and an inline validation message SHALL be displayed.

**Validates: Requirements 5.7**

---

### Property 7: No pending digest row when no qualifying membership exists

_For any_ `(groupId, actorUserId)` pair where every `GroupMembership` with `emailNotificationsEnabled = true` either belongs to the actor or is archived, calling `scheduleGroupEmailDigest` SHALL NOT upsert a `GroupEmailDigestPending` row.

**Validates: Requirements 6.1**

---

### Property 8: Email digest recipient eligibility (event-type AND member filters)

_For any_ group member with `emailNotificationsEnabled = true` whose `userId` is **not** in `windowActorIds` (self-exclusion is handled separately by Property 9 and is applied as a query-level filter before eligibility evaluation), any set of `ActivityType` values observed in the digest window (`windowEventTypes`), any set of actor user IDs in that window (`windowActorIds`), and any membership filter configuration, `processDueGroupEmailDigests` SHALL include that member as a recipient if and only if:

1. at least one `ActivityType` in `windowEventTypes` maps to a `true` event flag on the membership (`isActivityTypeEnabled`), AND
2. either `notifyAllMembers = true` or at least one user ID in `windowActorIds` appears in `includedUserIds`.

**Validates: Requirements 6.3, 6.4, 6.5**

---

### Property 9: Self-notification exclusion from email digest

_For any_ group member and any membership filter configuration, when `processDueGroupEmailDigests` runs for a window in which that member's `userId` is one of the actors in `windowActorIds`, the member SHALL NOT appear in the recipient list regardless of their `notifyAllMembers` or `includedUserIds` values.

**Validates: Requirements 6.6**

---

### Property 10: Email-disabled members are never digest recipients

_For any_ group member with `emailNotificationsEnabled = false`, when `processDueGroupEmailDigests` runs, that member SHALL NOT receive a digest email regardless of their push subscription status, `notifyAllMembers` value, `includedUserIds`, or any event-flag configuration.

**Validates: Requirements 7.4**

---

### Property 11: isActivityTypeEnabled identity

_For any_ `ActivityType` in the defined mapping (`CREATE_EXPENSE`, `UPDATE_EXPENSE`, `UPDATE_GROUP`, `DELETE_EXPENSE`) and _for any_ preferences object `prefs` with boolean event flags, `isActivityTypeEnabled(activityType, prefs)` SHALL return exactly the value of the corresponding named flag — `prefs.notifyOnCreate` for `CREATE_EXPENSE`, `prefs.notifyOnUpdate` for `UPDATE_EXPENSE` and `UPDATE_GROUP`, and `prefs.notifyOnDelete` for `DELETE_EXPENSE`.

**Validates: Requirements 10.5**

---

## Error Handling

### Push channel errors

| Scenario                                              | Behavior                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| VAPID keys absent                                     | Push toggle rendered disabled with `pushUnavailable` i18n message; popover still opens |
| Browser does not support Web Push                     | Push toggle rendered disabled with `notSupported` message                              |
| `Notification.requestPermission()` returns `"denied"` | Push toggle rendered disabled with `permissionDenied` message; no UI revert needed     |
| Subscribe or unsubscribe call throws                  | Toggle reverts to pre-interaction state; `subscribeError` toast shown                  |

### Email channel errors

| Scenario                                                        | Behavior                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `setNotificationPreferences` mutation fails when toggling email | Toast error shown; toggle reverts to pre-interaction value via optimistic rollback             |
| `getNotificationPreferences` query fails on mount               | Email row rendered disabled with an error message; remains disabled until popover is remounted |

### Shared filter errors

| Scenario                                                                                    | Behavior                                                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `setNotificationPreferences` fails                                                          | Filter controls revert to last saved state; error toast shown                                                       |
| `setNotificationPreferences` succeeds but `updatePreferences` (PushSubscription sync) fails | `GroupMembership` update is kept; warning toast shown indicating push filter sync failed (auto-dismisses after 5 s) |
| Validation violated (no event or no member selected)                                        | Save blocked; inline validation message shown; no network request issued                                            |

### Digest scheduler errors

`processDueGroupEmailDigests` catches per-group errors and increments the `errors` counter without aborting the loop. Pending rows are deleted even when zero eligible recipients are found (silent cleanup). Individual email delivery failures are logged and counted in `errors` without retrying.

---

## i18n

All new and removed keys live under the `Notifications` namespace in `messages/*.json`. The project falls back to `en-US` via `deepmerge` in `src/i18n.ts`, so new keys not yet translated in other locales degrade gracefully.

### New keys to add to `messages/en-US.json`

| Key                               | English value                                                          |
| --------------------------------- | ---------------------------------------------------------------------- |
| `Notifications.channelsLabel`     | `"Channels"`                                                           |
| `Notifications.pushLabel`         | `"Push notifications"`                                                 |
| `Notifications.pushUnavailable`   | `"Push notifications are not available in this deployment."`           |
| `Notifications.emailLabel`        | `"Email digest"`                                                       |
| `Notifications.emailHint`         | `"after 5 quiet minutes"`                                              |
| `Notifications.enableChannelHint` | `"Enable a channel to configure who and what you get notified about."` |
| `Notifications.pushSyncWarning`   | `"Preferences saved, but push notification filter sync failed."`       |

### Keys to remove from all locale files

The following keys are referenced only by `EmailNotificationToggle` and SHALL be removed as part of the same change that deletes the component:

- `Notifications.enableEmailNotifications`
- `Notifications.disableEmailNotifications`
- `Notifications.emailEnabledToast`
- `Notifications.emailDisabledToast`
- `Notifications.emailToggleError`

Existing keys reused unchanged: `Notifications.membersLabel`, `Notifications.eventsLabel`, `Notifications.eventCreate`, `Notifications.eventUpdate`, `Notifications.eventDelete`, `Notifications.notSupported`, `Notifications.permissionDenied`, `Notifications.subscribeError`, `Notifications.selectAtLeastOneFilter`.

---

## Testing Strategy

### Unit tests

Focus on the pure logic layers that can be verified with concrete examples:

- `isActivityTypeEnabled`: verify each `ActivityType` maps to the correct flag (example-based, one test per type variant).
- `isPushSubscriptionEligible`: existing tests are sufficient; no new tests needed for the function itself.
- `scheduleGroupEmailDigest` coarse pre-filter: verify it returns early when zero non-actor opted-in memberships exist (example test with mock Prisma client).
- `processDueGroupEmailDigests` event-type filter: example test — membership has `notifyOnCreate = false`; window contains only `CREATE_EXPENSE`; expect zero recipients.
- `processDueGroupEmailDigests` member filter: example test — membership has `notifyAllMembers = false` with `includedUserIds = ['user-A']`; window actor is `user-B`; expect zero recipients.
- `GroupNotificationToggle` bell-icon logic: example test — at least one channel enabled → `Bell`, all disabled → `BellOff`.
- `NotificationSettingsPopover` conditional sections: example test — no channels enabled → Members and Events sections hidden; one channel enabled → both shown.

### Property-based tests

PBT is appropriate for this feature because the filter evaluation logic has a large combinatorial input space (any combination of event flags × any set of actor IDs × any membership configuration) where running many iterations will surface edge cases not covered by hand-written examples.

**Library:** `fast-check` — already in `package.json` at `^4.8.0`.

**Configuration:** minimum 100 iterations per property (`numRuns: 100` in fast-check options).

**Tag format:** `// Feature: unified-group-notifications, Property <N>: <property text>`

Test files follow the repo convention of co-location in `__tests__/` beside the module under test, with `.test.ts` suffix:

| Property                                                     | Test file                                                                               | What varies                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1: Bell icon reflects channel state                         | `src/components/__tests__/group-notification-toggle.property.test.tsx`                  | Random (pushEnabled, emailEnabled) booleans                       |
| P2: Filter sections visibility                               | `src/components/__tests__/notification-settings-popover.property.test.tsx`              | Random (pushEnabled, emailEnabled) booleans                       |
| P3: Push channel inherits defaults on first subscribe        | `src/components/__tests__/group-notification-toggle.property.test.tsx`                  | Any member without prior prefs                                    |
| P4: Notification preferences round-trip                      | `src/trpc/routers/group-membership/__tests__/notification-preferences.property.test.ts` | Random valid preference payload (6 fields)                        |
| P5: Shared filter write-through to PushSubscription          | `src/components/__tests__/group-notification-toggle.property.test.tsx`                  | Random valid filter combination                                   |
| P6: Validation guard blocks invalid filter saves             | `src/components/__tests__/notification-settings-popover.property.test.tsx`              | Generated invalid filter combinations                             |
| P7: No pending row when no qualifying membership             | `src/lib/email/__tests__/group-activity-digest.property.test.ts`                        | Any (groupId, actorUserId) with no qualifying memberships         |
| P8: Email digest eligibility (event-type AND member filters) | `src/lib/email/__tests__/group-activity-digest.property.test.ts`                        | Random `windowEventTypes` × `windowActorIds` × membership configs |
| P9: Self-notification exclusion                              | `src/lib/email/__tests__/group-activity-digest.property.test.ts`                        | Any membership config where member is among windowActorIds        |
| P10: Email-disabled members never receive digests            | `src/lib/email/__tests__/group-activity-digest.property.test.ts`                        | Any membership with `emailNotificationsEnabled = false`           |
| P11: isActivityTypeEnabled identity                          | `src/lib/push/__tests__/subscription-filters.property.test.ts`                          | Any mapped `ActivityType` × any flag struct                       |

### Integration tests

- Render `GroupNotificationToggle` with VAPID key unset → push row is disabled, email row is interactive (no VAPID key guard on the toggle itself).
- Group header renders `GroupNotificationToggle` and does not render `EmailNotificationToggle` or `PushNotificationToggle` as standalone components.
- `getNotificationPreferences` and `setNotificationPreferences` tRPC procedures return and persist correct values end-to-end against a test database.
