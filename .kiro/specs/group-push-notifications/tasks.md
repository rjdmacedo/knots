# Implementation Plan: Group Push Notifications

## Overview

This plan implements opt-in push notifications for Knots, enabling users to receive real-time alerts when changes occur in groups they subscribe to. The implementation follows a bottom-up approach: database schema and environment setup first, then server-side logic (tRPC router, dispatch), then client-side (service worker, React hook, UI component), and finally integration wiring.

**Implementation language:** TypeScript (Next.js full-stack)

## Tasks

- [x] 1. Infrastructure and tRPC router setup

  - [x] 1.1 Register push subscriptions router in the app router

    - Import `pushSubscriptionsRouter` from `@/trpc/routers/push-subscriptions` in `src/trpc/routers/_app.ts`
    - Add `pushSubscriptions: pushSubscriptionsRouter` to the `createTRPCRouter` call
    - _Requirements: 8.6_

  - [x] 1.2 Update `.env.example` with VAPID key placeholders

    - Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY=` and `VAPID_PRIVATE_KEY=` with comments explaining they are optional and enable push notifications
    - _Requirements: 2.1, 2.2_

  - [x] 1.3 Write property test for VAPID key validation

    - **Property 2: VAPID key validation accepts only valid base64url strings**
    - Use fast-check to generate arbitrary strings and verify the regex `^[A-Za-z0-9_-]+$` accepts/rejects correctly
    - Create test file at `src/lib/__tests__/vapid-validation.property.test.ts`
    - **Validates: Requirements 2.1**

  - [x] 1.4 Write property tests for tRPC input validation and upsert logic
    - **Property 5: Subscription upsert idempotence**
    - **Property 11: tRPC input validation rejects invalid subscription data**
    - **Property 12: Idempotent delete**
    - **Property 13: List subscriptions returns correct set for endpoint**
    - Create test file at `src/trpc/routers/push-subscriptions/__tests__/push-subscriptions.property.test.ts`
    - **Validates: Requirements 3.4, 8.1, 8.2, 8.4, 8.5**

- [x] 2. Checkpoint - Infrastructure verified

  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Notification dispatch service

  - [x] 3.1 Create the push payload builder

    - Create `src/lib/push/build-payload.ts`
    - Implement `buildPushPayload(activityType, groupId, groupName, expenseTitle?)` returning `{ localeKey, params, url }`
    - Map activity types to locale keys: CREATE_EXPENSE → "notifications.expenseCreated", UPDATE_EXPENSE → "notifications.expenseUpdated", DELETE_EXPENSE → "notifications.expenseDeleted", UPDATE_GROUP → "notifications.groupUpdated"
    - Include appropriate params (title for expenses, group for group updates)
    - Set url to `/groups/${groupId}/expenses` for expense activities and `/groups/${groupId}` for group updates
    - _Requirements: 6.2, 6.3, 9.1_

  - [x] 3.2 Write property tests for payload builder

    - **Property 9: Notification payload construction by activity type**
    - **Property 14: Payload contains localization keys, not pre-rendered text**
    - Create test file at `src/lib/push/__tests__/build-payload.property.test.ts`
    - **Validates: Requirements 6.2, 6.3, 9.1**

  - [x] 3.3 Create the notification dispatch service

    - Create `src/lib/push/dispatch-notifications.ts`
    - Implement `dispatchNotifications(groupId, activityType, extra)` that:
      - Queries all subscriptions for the group from the database
      - Filters out subscriptions where participantName matches the activity's participantId (self-notification filtering)
      - Calls `buildPushPayload` to construct the notification payload
      - Sends push notification to each eligible subscription using `web-push` with VAPID credentials from env
      - Deletes subscriptions that return HTTP 410 or 404
      - Logs errors for other failures without retrying
      - Skips dispatch if no subscriptions exist
    - Configure web-push with VAPID keys from `src/lib/env.ts`
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 5.2, 5.3, 5.5_

  - [x] 3.4 Write property tests for notification dispatch logic
    - **Property 7: Participant-based notification filtering**
    - **Property 8: Notification dispatch reaches all eligible subscriptions**
    - **Property 10: Subscription cleanup on HTTP 410/404 only**
    - Create test file at `src/lib/push/__tests__/dispatch-notifications.property.test.ts`
    - **Validates: Requirements 5.2, 5.3, 6.1, 6.4, 6.5**

- [x] 4. Integrate dispatch with activity logging

  - [x] 4.1 Hook notification dispatch into the logActivity function
    - Modify `logActivity` in `src/lib/api.ts` to call `dispatchNotifications` after persisting the activity
    - Only dispatch if VAPID keys are configured (check `env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `env.VAPID_PRIVATE_KEY`)
    - Fetch group name and expense title as needed for the payload
    - Dispatch is fire-and-forget (do not await or block the activity log response)
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

- [x] 5. Checkpoint - Server-side complete

  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Service worker and locale resolution

  - [x] 6.1 Create the service worker with push event handling and notification click

    - Create `public/sw.js` as a static JavaScript file
    - Handle `push` event: parse payload JSON, resolve notification content using bundled locale data, call `self.registration.showNotification`
    - Handle `notificationclick` event: open or focus the URL from the payload, fall back to `/groups`
    - Handle missing title/body fields with defaults (app name "Knots" + "New activity in your group")
    - _Requirements: 1.3, 1.4, 1.5, 9.2_

  - [x] 6.2 Bundle locale data for the service worker

    - Create static JSON file (`public/sw-locales.json`) containing the `Notifications` namespace from all 19 locale files
    - The service worker fetches this data at install time and caches it
    - Implement `resolveLocale(navigatorLanguage)` to match against supported locales with fallback to en-US
    - Implement `resolveNotificationContent(localeData, localeKey, params, locale)` with fallback chain: target locale → en-US → raw key
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.3 Write property tests for locale resolution
    - **Property 1: Push event handler displays correct notification content**
    - **Property 15: Locale resolution with fallback chain**
    - Create test file at `src/lib/push/__tests__/locale-resolution.property.test.ts`
    - **Validates: Requirements 1.3, 1.4, 9.2, 9.3, 9.4, 9.5**

- [x] 7. Client-side push subscription logic and UI

  - [x] 7.1 Create service worker registration utility

    - Create `src/lib/push/register-sw.ts`
    - Implement `registerServiceWorker()` that registers `/sw.js` and returns the registration
    - Implement `isPushSupported()` that checks for `serviceWorker` in navigator, `PushManager` in window, and `Notification` in window
    - _Requirements: 1.1, 1.2, 7.1_

  - [x] 7.2 Add translation keys to all 19 locale files

    - Add the `Notifications` namespace with keys: subscribe, unsubscribe, selectParticipant, noParticipant, permissionDenied, notSupported, error, expenseCreated, expenseUpdated, expenseDeleted, groupUpdated, notificationTitle, defaultBody
    - Add to all 19 locale JSON files in `/messages/{locale}.json`
    - _Requirements: 9.1, 9.2_

  - [x] 7.3 Create the PushNotificationToggle component with inline subscription logic
    - Create `src/components/push-notification-toggle.tsx`
    - Inline push subscription state management (isSupported, isSubscribed, isLoading, participantName)
    - Implement subscribe: request permission → create push subscription with VAPID applicationServerKey → call tRPC create mutation
    - Implement unsubscribe: call tRPC delete mutation → unsubscribe from browser Push API
    - Implement updateParticipant: call tRPC create mutation (upsert) with new participant
    - Render subscribe/unsubscribe toggle using shadcn/UI Button with Bell/BellOff icons
    - Show participant dropdown (optional, populated from group participants) defaulting to no selection
    - Show loading state while operations are in progress (disable control)
    - Show error messages for permission denied and subscription failures
    - Hide entirely when `isPushSupported()` returns false
    - Use next-intl for all UI strings
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.4, 7.3, 7.4, 7.5_

- [x] 8. Wire UI into the group page

  - [x] 8.1 Integrate PushNotificationToggle into the group page layout
    - Import and render `PushNotificationToggle` in `src/app/groups/[groupId]/layout.client.tsx`, passing groupId and participants
    - Conditionally render only when VAPID public key env var is available (client-side check via `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`)
    - _Requirements: 4.1, 7.3, 2.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The original design specified a separate `usePushSubscription` hook, but the implementation inlined the logic directly into the `PushNotificationToggle` component — functionally equivalent
- The service worker is a static JS file (`public/sw.js`) — not compiled by Next.js
- The `web-push` library handles VAPID signing and payload encryption
- Notification dispatch is fire-and-forget to avoid blocking activity logging
- The feature is fully gated by VAPID env vars — zero-config deployments are unaffected
- The PWA manifest already includes `id` and `display: standalone` fields (Requirement 7.2 satisfied)
- The `sw-locales.json` is a pre-built static file containing all 19 locale translations for the Notifications namespace

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "4.1", "6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3"] },
    { "id": 6, "tasks": ["8.1"] }
  ]
}
```
