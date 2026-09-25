# Implementation Plan: Account Settings Page

## Overview

Rebuild `/settings` to match Spliit Cloud’s account settings layout: shared inset rows, a profile card (photo, name, email code, password dialog, passkeys), autosaved app preferences, and notification channel rows. Leave out AI features, webhooks, backups & export, mascot, and connected apps. Keep username, blocked users, and sign out, restyled with the same chrome.

Build bottom-up: schema and pure helpers, then chrome, then each section, then wire dispatch and sign-in. Do not start by rewriting `page.tsx`.

Implementation language: TypeScript (React 19 / Next.js App Router), matching this repo.

## Tasks

- [ ] 1. Schema and profile mutations
  - [ ] 1.1 Add the Prisma fields and models from the design
    - `User.image`, `User.locale`, `User.theme`, `User.notificationsEnabled`
    - `User.passwordHash` optional
    - `Passkey`, `EmailChangeChallenge`, `UserNotificationPreference`
    - `PushSubscription.groupId` optional, plus a partial unique index on `endpoint` where `groupId` is null
    - Migration only. No UI yet
    - _Requirements: 3.2, 5.5, 6.3, 7.5, 8.3, 9.11, 10.5_

  - [ ] 1.2 Extend `profile.getProfile` and `profile.changePreferences`
    - Return `image`, `locale`, `theme`, `notificationsEnabled`, `emailVerified`, `hasPassword`
    - Accept optional `locale` (`Locale` union from `src/i18n.ts`) and `theme` (`light` | `dark` | `system`)
    - _Requirements: 4.4, 8.3, 8.4, 8.5_

  - [ ] 1.3 Profile image mutations
    - `profile.presignImage`, `profile.setImage`, `profile.removeImage`
    - Presign reuses the existing S3 client and bucket. `setImage` accepts only a key this presign just issued
    - When S3 env is missing, the mutations throw a typed unavailable error
    - _Requirements: 3.2, 3.4, 3.5_

- [ ] 2. Email change
  - [ ] 2.1 Pure email-address helper and challenge service
    - Normalize, reject invalid, same-as-current, and in-use addresses
    - Create a 6-digit code, store a hash, expire it, cap attempts, rate-limit with `src/lib/auth/rate-limiter.ts`
    - Send through `src/lib/auth/email-service.ts`
    - Confirm swaps `User.email` and sets `emailVerified` in one transaction
    - _Requirements: 5.3, 5.5, 5.6, 5.7, 5.8_

  - [ ]\* 2.2 Property test for email normalization and the attempt cap
    - **Property 1: A code is accepted once** — a matching code succeeds once; a second confirm, a wrong code past the attempt cap, and an expired code all fail and leave `User.email` unchanged
    - **Validates: Requirements 5.5, 5.6, 5.7**

  - [ ] 2.3 tRPC `profile.requestEmailChange` and `profile.confirmEmailChange`
    - _Requirements: 5.2, 5.3, 5.5_

- [ ] 3. Password remove and passkeys
  - [ ] 3.1 `profile.removePassword`
    - Requires the current password
    - Refuses when the user has zero passkeys (`NO_ALTERNATIVE_SIGN_IN`)
    - Sets `passwordHash` to null
    - Credentials sign-in treats a null hash as invalid credentials
    - _Requirements: 6.3, 6.4, 6.6_

  - [ ]\* 3.2 Property test for the remove-password gate
    - **Property 2: Password removal requires another sign-in method** — remove succeeds only when the current password matches and `passkeyCount >= 1`
    - **Validates: Requirements 6.3, 6.4, 7.7**

  - [ ] 3.3 Passkey server module `src/lib/passkey/`
    - Registration and authentication options, verification, list, rename, delete
    - rpID and origin from the app URL
    - Single-use challenges
    - Delete refuses when this is the last passkey and `passwordHash` is null
    - `profile.confirmRecentPassword` checks the hash and refreshes the session timestamp used by the 5-minute gate
    - _Requirements: 7.3, 7.4, 7.7_

  - [ ] 3.4 Passkey sign-in on the existing credentials page
    - “Use a passkey” runs the authentication ceremony and creates the same session shape as a password login
    - _Requirements: 7.1, 7.3_

- [ ] 4. Settings chrome
  - [ ] 4.1 Create `src/app/settings/settings-ui.tsx`
    - `SettingsSection`, `SettingsGroup`, `SettingsList`, `SettingsRow`, `SettingsFieldRow`, `SettingsBadge`, `SettingsSaving`, `SettingsSectionSkeleton`, `settingsControlId`
    - Match the design’s layout rules. No data fetching
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 11.4_

- [ ] 5. Profile section UI
  - [ ] 5.1 Split the page into a server loader and `settings-page.tsx`
    - Keep `/settings` and `requireSession`
    - Visible `h1` plus back button (`history.back`, else `/`)
    - Section order from Requirement 2
    - _Requirements: 1.5, 1.6, 2.1, 2.3, 2.4, 2.5_

  - [ ] 5.2 Profile photo and display name
    - Client-side JPEG resize, hidden file input, outline Choose / Remove
    - Immediate upload and remove
    - Name input with dirty Save changes, client length checks, `role="alert"`, toast, invalidate profile
    - Photo and name inside `form#account-profile-form` with `className="contents"`. Save uses the `form` attribute
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 5.3 Email, password, and passkey rows plus dialogs
    - Email row and two-step dialog (60s resend, 6-digit code, back to address)
    - Password row: Change always; Remove only when `passkeyCount > 0`. Dialogs reuse `validatePassword`
    - Passkey row: unsupported state, add dialog, list with date and SYNCED / DEVICE-BOUND / BACKED UP badges, delete confirm, recent-password gate
    - These rows are outside the profile form
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.9, 6.1, 6.2, 6.5, 6.7, 6.8, 7.1, 7.2, 7.5, 7.6, 7.8_

  - [ ]\* 5.4 Page heading and save-button test
    - One `h1`. `h2` order is Profile, App preferences, Notifications, Username, Blocked users, Account
    - Save changes is disabled when the name equals the saved name and enabled when it differs
    - **Validates: Requirements 1.5, 2.1, 4.2**

- [ ] 6. App preferences
  - [ ] 6.1 `AccountPreferences` with four autosaved rows
    - Order: language, default currency, account timezone, theme
    - No mascot row
    - Language writes the cookie and `changePreferences({ locale })`
    - Currency and timezone keep `changePreferences`
    - Theme calls `setTheme` and `changePreferences({ theme })`
    - Header `SettingsSaving` while pending
    - Selectors full width below `sm`, `sm:max-w-xs` from `sm`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8_

  - [ ] 6.2 `AccountPreferencesSync`
    - On load, apply `user.locale` to the cookie and `user.theme` to `next-themes` when they differ from the local value
    - Mount it once in the authenticated shell
    - _Requirements: 8.6_

- [ ] 7. Notifications
  - [ ] 7.1 Category metadata and preference API
    - `notification-category-metadata.ts` with the three groups and `comingSoon` on weekly summary and Knots news
    - `profile.notificationPreferences` get and save-one-category
    - `profile.setNotificationsEnabled`
    - Defaults from the design when no row exists
    - _Requirements: 9.3, 9.4, 9.7, 9.11, 9.12, 9.13_

  - [ ]\* 7.2 Property test for the channel label and toggle
    - **Property 3: Channel toggle is its own inverse, and the label is a pure function of the set** — Off, Email, Push, and Email + Push
    - **Validates: Requirements 9.5, 9.7**

  - [ ] 7.3 `NotificationsPreferences` UI
    - Master switch hides the three groups and keeps This device
    - `ChannelSelector`: popover at `md` and up, drawer below, with Done
    - Optimistic save, rollback toast, disable other rows while one save is pending
    - Coming soon rows: one badge, no control, reduced opacity
    - Email channel disabled with a link to `#account-settings-email` when the user has no verified email
    - Push channel disabled with the existing unsupported / unconfigured / iOS / denied copy
    - _Requirements: 9.1, 9.2, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.12_

  - [ ] 7.4 This device
    - Allow `PushSubscription.groupId = null` in the existing subscribe/unsubscribe helpers
    - Enable and Disable buttons and the four unavailable states
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 7.5 Honor account preferences in dispatch
    - Skip a user when `notificationsEnabled` is false
    - Skip push or email when that category flag is false
    - Keep group membership filters
    - Map activity types to categories as in the design
    - _Requirements: 9.11, 9.13_

- [ ] 8. Restyle the Knots-only sections and add copy
  - [ ] 8.1 Username, blocked users, and sign out
    - Wrap each in `SettingsSection` / `SettingsRow`
    - Keep the current mutations and dialogs
    - _Requirements: 2.1, 2.2_

  - [ ] 8.2 Strings
    - Add the new `ProfileSettings` keys to `messages/en-US.json` and `messages/pt-PT.json`
    - English follows the reference screen. Portuguese translates those strings
    - _Requirements: 11.1, 11.2_

- [ ] 9. Verification
  - [ ] 9.1 Run `pnpm check-types`, the new tests, and the existing profile and push tests
  - [ ] 9.2 Browser pass on `/settings` at about 375px and 1280px, light and dark
    - Photo choose/remove (or the unavailable toast when S3 is off)
    - Dirty Save changes, clean button disabled
    - Email dialog both steps
    - Password change dialog
    - Passkey add when the browser supports it
    - Preference rows persist after reload
    - Notification master switch, one channel save, Coming soon rows, This device button
    - Username, blocked users, and sign out still work
