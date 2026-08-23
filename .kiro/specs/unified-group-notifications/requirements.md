# Requirements Document

## Introduction

This feature unifies the two separate notification controls in the group header — the standalone `EmailNotificationToggle` and the push-only `PushNotificationToggle` — into a single `GroupNotificationToggle` popover. Members configure all notification preferences in one place: which channel(s) to use (Push and/or Email), whose activity to follow, and which events to receive. The popover is always visible regardless of whether VAPID keys are configured, because email delivery does not depend on push infrastructure. Member and event filters become shared preferences, applying equally to both channels. The old email-only toggle component is removed.

## Glossary

- **GroupNotificationToggle**: The unified notification control component that replaces both `PushNotificationToggle` and `EmailNotificationToggle` in the group header.
- **NotificationSettingsPopover**: The popover panel rendered by `GroupNotificationToggle` containing Channels, Members, and Events sections.
- **Channel**: A delivery mechanism for notifications. Two channels are supported: Push (browser/device push notifications) and Email (debounced digest emails).
- **Push Channel**: Browser push notification delivery, requiring VAPID configuration and browser permission.
- **Email Channel**: Debounced digest email delivery; sends one email per group after 5 quiet minutes following the last activity.
- **Shared Filters**: The member selection (`notifyAllMembers` / `includedUserIds`) and event toggles (`notifyOnCreate`, `notifyOnUpdate`, `notifyOnDelete`) stored on `GroupMembership` and applied to both channels.
- **GroupMembership**: The Prisma model linking a `User` to a `Group`, which holds `emailNotificationsEnabled` and will hold the shared filter fields.
- **PushSubscription**: The Prisma model for a device-level push subscription; continues to store the push endpoint and auth keys.
- **Digest Scheduler**: The server-side in-process scheduler at `src/lib/email/group-activity-digest-scheduler.ts`, started via `startGroupEmailDigestScheduler()` in `src/instrumentation.ts`, that polls every ~60 s and sends due email digests.
- **Actor**: The user who performed the activity that triggered a notification.
- **Subscriber**: The group member who has opted in to one or more notification channels.
- **VAPID**: Voluntary Application Server Identification; the key pair required to send Web Push messages. Environment variables: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client-visible) and `VAPID_PRIVATE_KEY` (server-only). Both must be set together; `src/lib/env.ts` enforces this with a superRefine check. Push features are disabled when either key is absent.
- **notifyOnCreate / notifyOnUpdate / notifyOnDelete**: Boolean flags controlling which activity event types trigger notifications.

---

## Requirements

### Requirement 1: Single Notification Entry Point in Group Header

**User Story:** As a group member, I want one notification control in the group header so that I can manage all my notification preferences from a single place without hunting for separate email and push toggles.

#### Acceptance Criteria

1. THE `GroupNotificationToggle` SHALL be rendered in the group header actions area for every user who has an active session and is a participant of the group, replacing both the `EmailNotificationToggle` and the `PushNotificationToggle`, and SHALL be positioned before the ShareButton in the header actions area.
2. WHEN a group member views the group header, THE group header SHALL NOT render a standalone `EmailNotificationToggle` component.
3. WHEN `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is not set in the environment, THE `GroupNotificationToggle` SHALL still be rendered and interactive (not disabled).
4. THE `GroupNotificationToggle` SHALL display a bell icon when the member has at least one channel enabled, and a bell-off icon when no channels are enabled.
5. IF a group member has all notification channels disabled, THEN THE `GroupNotificationToggle` SHALL still be rendered and interactive (not disabled) in the group header.

---

### Requirement 2: Notification Settings Popover Structure

**User Story:** As a group member, I want the notification popover to show Channels, Members, and Events sections so that I have a clear, structured view of all my notification settings.

#### Acceptance Criteria

1. WHEN the member opens the `NotificationSettingsPopover`, THE popover SHALL display a Channels section, a Members section, and an Events section.
2. THE Channels section SHALL appear before the Members section, and the Members section SHALL appear before the Events section.
3. WHEN no channel is enabled, THE `NotificationSettingsPopover` SHALL display a hint reading "Enable a channel to configure who and what you get notified about."
4. WHEN no channel is enabled, THE `NotificationSettingsPopover` SHALL hide the Members and Events filter sections.
5. WHEN at least one channel is enabled, THE `NotificationSettingsPopover` SHALL display the Members and Events filter sections.
6. WHEN a section fails to load due to a transient error, THE `NotificationSettingsPopover` SHALL render whichever sections loaded successfully without blocking the rest of the popover.

---

### Requirement 3: Push Channel Toggle

**User Story:** As a group member, I want to enable or disable push notifications from within the unified popover so that I can control browser push delivery without a separate control.

#### Acceptance Criteria

1. THE Channels section SHALL display a Push toggle row with a label and a switch component.
2. WHEN `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is not set, THE Push toggle SHALL be rendered in a fully disabled state with the `pushUnavailable` i18n message indicating push is unavailable in this deployment.
3. WHEN the browser does not support Web Push, THE Push toggle SHALL be rendered in a fully disabled state with the existing `notSupported` message.
4. WHEN the browser has denied notification permission, THE Push toggle SHALL be rendered in a fully disabled state with the existing `permissionDenied` message.
5. WHEN the member enables the Push toggle on a supported browser with permission granted, THE `GroupNotificationToggle` SHALL subscribe the device using the existing push subscription logic and apply the current shared filter preferences from `GroupMembership`; IF no shared preferences exist yet, THE `GroupNotificationToggle` SHALL apply the default push preferences (`notifyAllMembers = true`, all event flags `true`).
6. WHEN the member disables the Push toggle, THE `GroupNotificationToggle` SHALL unsubscribe the device from push notifications for this group.
7. WHEN the `NotificationSettingsPopover` mounts, THE Push toggle SHALL reflect whether an active push subscription exists for the current device in this group.
8. WHILE a push subscribe or unsubscribe operation is in-flight, THE Push toggle switch SHALL be disabled and rendered in a loading state to prevent duplicate submissions.
9. IF a push subscribe or unsubscribe operation fails, THEN THE `GroupNotificationToggle` SHALL revert the toggle to the state it held before the interaction and display an error indication to the member.

---

### Requirement 4: Email Channel Toggle

**User Story:** As a group member, I want to enable or disable email digest notifications from within the unified popover so that I can receive a single summary email after group activity.

#### Acceptance Criteria

1. THE Channels section SHALL display an Email toggle row with a label, a switch component, and a hint reading "after 5 quiet minutes".
2. WHEN the member enables the Email toggle, THE `GroupNotificationToggle` SHALL set `emailNotificationsEnabled = true` on the member's `GroupMembership` via the `groupMembership.setEmailNotifications` tRPC mutation.
3. WHEN the member disables the Email toggle, THE `GroupNotificationToggle` SHALL set `emailNotificationsEnabled = false` on the member's `GroupMembership` via the `groupMembership.setEmailNotifications` tRPC mutation.
4. WHEN the `NotificationSettingsPopover` mounts, THE Email toggle SHALL reflect the `emailNotificationsEnabled` value returned by `groupMembership.getEmailNotifications`.
5. WHILE the `setEmailNotifications` mutation is in-flight, THE Email toggle switch SHALL be disabled and rendered in a loading state to prevent duplicate submissions.
6. WHEN the `setEmailNotifications` mutation completes successfully, THE Email toggle SHALL allow another interaction without any artificial hold delay.
7. IF the `setEmailNotifications` mutation fails, THEN THE `GroupNotificationToggle` SHALL display an error toast and revert the toggle to the value it held before the interaction.
8. IF the `getEmailNotifications` query fails on mount, THEN THE Email toggle SHALL be rendered in a disabled state with an error message, and SHALL remain disabled until the member reloads the popover.

---

### Requirement 5: Shared Member and Event Filters

**User Story:** As a group member, I want the member and event filter selections to apply to both push and email so that I only have to configure my preferences once.

#### Acceptance Criteria

1. THE `GroupMembership` model SHALL store `notifyAllMembers` (boolean, default `true`), `includedUserIds` (string array, default `[]`), `notifyOnCreate` (boolean, default `true`), `notifyOnUpdate` (boolean, default `true`), and `notifyOnDelete` (boolean, default `true`) as shared notification preference fields.
2. WHEN the member changes the Members filter in the popover, THE `GroupNotificationToggle` SHALL persist the updated `notifyAllMembers` and `includedUserIds` values to `GroupMembership`.
3. WHEN the member changes the Events filter in the popover, THE `GroupNotificationToggle` SHALL persist the updated `notifyOnCreate`, `notifyOnUpdate`, and `notifyOnDelete` values to `GroupMembership`.
4. IF persisting shared filter changes to `GroupMembership` fails due to a network or service error, THEN THE `GroupNotificationToggle` SHALL revert the filter controls to the last successfully saved state and display an error toast.
5. WHEN the member has a Push subscription active, THE `GroupNotificationToggle` SHALL also sync the shared filter values to the corresponding `PushSubscription` fields so that existing push dispatch logic continues to function unchanged.
6. IF syncing the shared filter values to the `PushSubscription` row fails due to a network or service error, THEN THE `GroupNotificationToggle` SHALL still persist the changes to `GroupMembership` and display a warning toast that auto-dismisses after 5 seconds indicating that push filter sync failed.
7. THE `NotificationSettingsPopover` SHALL validate that at least one event type (`notifyOnCreate`, `notifyOnUpdate`, or `notifyOnDelete`) is active and at least one member selector is active before saving; IF either constraint is violated, THEN saving SHALL be prevented.
8. WHEN saving is prevented by the validation in criterion 7, THE `NotificationSettingsPopover` SHALL display an inline message communicating that at least one event type and at least one member must remain selected.

---

### Requirement 6: Email Digest Respects Shared Filters

**User Story:** As a group member, I want email digests to honour the same member and event filters as push so that I only receive emails for activity I actually care about.

#### Background

`GroupEmailDigestPending` stores one pending row per group (`groupId`, `lastActorUserId`, `sendAfter`, `createdAt`). A 5-minute window may cover multiple activities from multiple actors and multiple `ActivityType` values — the pending row does not record which event types or actors were involved. Eligibility must therefore be evaluated at send time by querying the `Activity` table for the window `[createdAt, sendAfter)` rather than relying on a single stored `activityType`.

The `ActivityType` → event-flag mapping mirrors the existing push filter logic:

- `CREATE_EXPENSE` → `notifyOnCreate`
- `UPDATE_EXPENSE` or `UPDATE_GROUP` → `notifyOnUpdate`
- `DELETE_EXPENSE` → `notifyOnDelete`

#### Acceptance Criteria

1. WHEN `scheduleGroupEmailDigest` is called, THE Digest Scheduler SHALL check whether at least one `GroupMembership` where `emailNotificationsEnabled = true` and `userId ≠ actorUserId` exists before upserting a `GroupEmailDigestPending` row; IF no such membership exists, THE Digest Scheduler SHALL NOT create or update the row. Note: this is a coarse pre-filter only — member/event filters are applied at send time in `processDueGroupEmailDigests`; a pending row may therefore be created that yields zero recipients at send time and is silently deleted.
2. WHEN `processDueGroupEmailDigests` runs for a pending digest, THE Digest Scheduler SHALL query the `Activity` table for all activities in the window `[pending.createdAt, pending.sendAfter)` for the group to obtain the set of distinct `activityType` values (`windowEventTypes`) and the set of distinct `participantId` / actor user IDs (`windowActorIds`) recorded in that window.
3. WHEN `processDueGroupEmailDigests` evaluates a `GroupMembership` where `emailNotificationsEnabled = true`, THE Digest Scheduler SHALL include that member as a candidate recipient only if at least one `ActivityType` in `windowEventTypes` maps to a notification flag that is `true` on that membership (e.g. `CREATE_EXPENSE` → `notifyOnCreate`, `UPDATE_EXPENSE` / `UPDATE_GROUP` → `notifyOnUpdate`, `DELETE_EXPENSE` → `notifyOnDelete`).
4. WHEN `processDueGroupEmailDigests` evaluates a membership where `notifyAllMembers = true`, THE Digest Scheduler SHALL include that member as a digest recipient (subject to the actor-exclusion rule in criterion 6) if the event-type filter in criterion 3 is satisfied.
5. WHEN `processDueGroupEmailDigests` evaluates a membership where `notifyAllMembers = false`, THE Digest Scheduler SHALL include that member as a digest recipient only if at least one user ID in `windowActorIds` appears in the membership's `includedUserIds` AND the event-type filter in criterion 3 is satisfied.
6. THE Digest Scheduler SHALL NOT send a digest email to a member whose own `userId` appears in `windowActorIds` (i.e. do not notify someone about their own activity); members who did not act in the window SHALL receive the digest regardless of whether other actors did.

---

### Requirement 7: Push Behavior Unchanged for Push-Only Users

**User Story:** As a group member who only uses push notifications, I want my push notifications to keep working exactly as before so that the unification does not break my existing setup.

#### Acceptance Criteria

1. WHEN a `PushSubscription` exists for a member, THE `dispatchNotifications` function SHALL evaluate eligibility by reading only the `notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, and `notifyOnDelete` fields from the `PushSubscription` row directly, without reading shared membership filter fields.
2. WHEN the member updates the shared filters via the new popover and a `PushSubscription` row exists for the current device, THE `GroupNotificationToggle` SHALL overwrite the `notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, and `notifyOnDelete` fields on that `PushSubscription` row within the same save operation as the `GroupMembership` update.
3. WHEN the member updates the shared filters via the new popover and no `PushSubscription` row exists for the current device, THE `GroupNotificationToggle` SHALL skip the `PushSubscription` sync and complete the operation using only the `GroupMembership` update.
4. IF a member's `GroupMembership` has `emailNotificationsEnabled = false`, THEN THE email digest logic SHALL NOT schedule or send a digest for that member, regardless of whether a `PushSubscription` row exists for them.

---

### Requirement 8: i18n — New Copy Keys

**User Story:** As a user browsing in any supported locale, I want all new notification UI copy to be translated or fall back gracefully so that the interface remains understandable.

#### Acceptance Criteria

1. THE `messages/en-US.json` file SHALL contain all new `Notifications.*` keys required by the unified popover, including keys for: the Channels section label, Push channel label, Push unavailable message (`pushUnavailable`), Email channel label, Email debounce hint, and any new toast or error messages introduced by this feature.
2. WHEN a locale file does not contain a new `Notifications.*` key, THE application SHALL fall back to the `en-US` value via the existing `deepmerge` i18n fallback in `src/i18n.ts` without throwing a runtime error.
3. THE keys `enableEmailNotifications`, `disableEmailNotifications`, `emailEnabledToast`, `emailDisabledToast`, and `emailToggleError` SHALL be removed from `messages/en-US.json` and all other locale files as part of the same change that deletes `EmailNotificationToggle`.
4. WHEN a locale file contains the removed keys after migration, THE build SHALL NOT emit type errors because the keys will no longer be referenced by any component.

---

### Requirement 9: Dead Code Removal

**User Story:** As a developer, I want the old email-only toggle component and its associated strings removed so that the codebase stays clean and free of unused code paths.

#### Acceptance Criteria

1. THE file `src/components/email-notification-toggle.tsx` SHALL be deleted from the codebase.
2. All import statements and JSX usages of `EmailNotificationToggle` SHALL be removed from every file in the codebase before the component file is deleted.
3. WHEN an authenticated group member views the group header, THE group header SHALL render the `GroupNotificationToggle` without a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` guard, regardless of whether the key is set.
4. THE keys `enableEmailNotifications`, `disableEmailNotifications`, `emailEnabledToast`, `emailDisabledToast`, and `emailToggleError` SHALL be removed from `messages/en-US.json` and from all other locale files in the `messages/` directory.
5. WHEN a developer runs `pnpm check-types`, THE TypeScript compiler SHALL report zero errors related to missing or unused notification i18n keys or removed component references.

---

### Requirement 10: Schema Migration and API Extension

**User Story:** As a developer, I want the database schema and API to be updated atomically with the UI changes so that the shared notification preferences are available to both the frontend and the digest scheduler from day one.

#### Acceptance Criteria

1. A Prisma migration SHALL add the following columns to the `GroupMembership` table with the specified defaults: `notifyAllMembers Boolean @default(true)`, `includedUserIds String[] @default([])`, `notifyOnCreate Boolean @default(true)`, `notifyOnUpdate Boolean @default(true)`, `notifyOnDelete Boolean @default(true)`; the migration SHALL be backward-compatible (existing rows receive the defaults without manual backfill).
2. THE `groupMembership` tRPC router SHALL expose a `getNotificationPreferences` query that returns `emailNotificationsEnabled`, `notifyAllMembers`, `includedUserIds`, `notifyOnCreate`, `notifyOnUpdate`, and `notifyOnDelete` for the calling member's membership in a given group in a single round-trip.
3. THE `groupMembership` tRPC router SHALL expose a `setNotificationPreferences` mutation that accepts any combination of the six fields from criterion 2 and persists them to `GroupMembership` in a single database write.
4. THE existing `getEmailNotifications` query and `setEmailNotifications` mutation SHALL remain available and continue to function for the duration of the transition; they MAY be removed in a follow-up once all callers are migrated to `getNotificationPreferences` / `setNotificationPreferences`.
5. WHEN `notifyOnActivity` is called with `ActivityType.UPDATE_GROUP`, `ActivityType.UPDATE_EXPENSE`, `ActivityType.CREATE_EXPENSE`, or `ActivityType.DELETE_EXPENSE`, THE mapping to shared filter flags SHALL be: `CREATE_EXPENSE` → `notifyOnCreate`; `UPDATE_EXPENSE` and `UPDATE_GROUP` → `notifyOnUpdate`; `DELETE_EXPENSE` → `notifyOnDelete`; this mapping SHALL be the single source of truth used by both the push dispatch path (`isPushSubscriptionEligible`) and the email digest path (`processDueGroupEmailDigests`).
