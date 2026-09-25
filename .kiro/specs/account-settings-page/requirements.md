# Requirements Document

## Introduction

Replace the current stacked-card `/settings` page with the account settings layout from Spliit Cloud (`/account/settings` in [antonio-ivanovski/spliit-cloud](https://github.com/antonio-ivanovski/spliit-cloud)). The visual and interaction reference is that page, adapted to Knots routes, auth, and data.

The page is one column of inset settings cards. Each card has a muted icon, an `h2`, a description, and divided rows (label and help on the left, control on the right). Profile identity saves with one explicit button. Photo, email, password, passkeys, preferences, and notification channels save on their own.

Three sections, in this order:

1. **Profile** — photo, display name, email, password, passkeys, Save changes.
2. **App preferences** — language, default currency, account timezone, theme. Autosaved.
3. **Notifications** — master switch, channel rows, this-device push.

Knots-only account actions that Spliit does not show stay on the page, after those three sections, using the same chrome: username, blocked users, and sign out.

## Out of scope

Do not build, stub, or reserve space for:

- AI features
- Webhooks
- Backups & export
- Mascot
- Connected apps
- Anonymous accounts, magic-link graduation, or placeholder emails

Do not replace the per-group notification popover. Account settings choose delivery channels. The group popover still filters which members and expense events a group notifies about.

## Glossary

- **Settings_Page**: The authenticated page at `/settings`.
- **Settings_Chrome**: The shared presentation pieces `SettingsSection`, `SettingsGroup`, `SettingsList`, `SettingsRow`, `SettingsFieldRow`, `SettingsBadge`, `SettingsSaving`, and `SettingsSectionSkeleton`.
- **Profile_Section**: The first card. Identity fields plus credentials.
- **Preferences_Section**: Language, currency, timezone, and theme.
- **Notifications_Section**: Master switch, category rows, and this-device push.
- **Channel_Selector**: The per-row control that toggles Email and Push. Popover from the `md` breakpoint up, drawer below it.
- **Email_Change_Dialog**: Two-step dialog: new address, then a 6-digit code sent to that address.
- **Passkey**: A WebAuthn credential registered to the signed-in user.

## Requirements

### Requirement 1: Shared settings chrome

**User Story:** As a user, I want every settings block to share one row layout, so that the page scans as a single list.

#### Acceptance Criteria

1. THE Settings_Page SHALL render section cards with `SettingsSection`: muted 16px icon, `h2` at `text-lg`, description at `text-sm text-muted-foreground`, optional header status, and an optional footer separated by a top border.
2. THE Settings_Chrome SHALL render rows that stack label above control below the `sm` breakpoint and place the control in a right column from `sm` upward.
3. THE Settings_Chrome SHALL make text controls `w-full` below `sm` and `sm:max-w-xs` from `sm` upward. Switches, short badges, and icon buttons keep their intrinsic width.
4. WHEN a section is loading, THE Settings_Page SHALL show `SettingsSectionSkeleton` with the same header, so the page does not swap to a centered spinner.
5. THE Settings_Page SHALL use one `h1`. Section titles SHALL be `h2`. Notification subgroups SHALL be `h3`.
6. THE Settings_Page SHALL keep the current max width (`max-w-[var(--breakpoint-md)]`) and a `gap-6` rhythm between sections.

### Requirement 2: Page order and Knots-only sections

**User Story:** As a user opening settings, I want the Spliit section order, and I still want username, blocked users, and sign out.

#### Acceptance Criteria

1. THE Settings_Page SHALL render, in order: Profile_Section, Preferences_Section, Notifications_Section, then username, blocked users, and sign out.
2. THE username, blocked users, and sign-out blocks SHALL use `SettingsSection` and SHALL keep their current mutations (`profile.changeUsername`, block/unblock, sign out, sign out all devices).
3. THE Settings_Page SHALL stay at `/settings`. The user menu link SHALL keep pointing at `/settings`.
4. WHEN the viewport is `sm` or wider, THE Settings_Page SHALL show an `h1` with a back button. Back uses browser history when `history.length > 1`, and otherwise navigates to `/`.
5. WHEN the viewport is below `sm`, THE `h1` SHALL remain visible, because Knots has no separate settings title in the app shell.

### Requirement 3: Profile photo

**User Story:** As a user, I want to set a photo that groups see immediately, and see my initials when I have none.

#### Acceptance Criteria

1. THE Profile_Section SHALL show a circular avatar. WHEN the user has no image, THE avatar SHALL show initials from the display name.
2. WHEN the user chooses an image, THE Settings_Page SHALL resize it to a JPEG and upload it before saving the URL on the user. The row SHALL NOT wait for Save changes.
3. WHEN the upload succeeds, THE Settings_Page SHALL refresh the session name and image used by the user menu and SHALL toast that the photo was updated.
4. WHEN the user has an image, THE Profile_Section SHALL show Remove photo. Remove deletes the stored object and clears the user image, then toasts.
5. WHEN object storage is not configured, Choose photo and Remove photo SHALL stay visible and SHALL toast a clear unavailable error without writing a user image.
6. THE Choose photo and Remove photo buttons SHALL be `outline` and SHALL NOT submit the profile form.

### Requirement 4: Display name and Save changes

**User Story:** As a user, I want my display name to change only when I press Save changes.

#### Acceptance Criteria

1. THE Profile_Section SHALL show the display name in a single text input, `autoComplete="name"`, max length 50.
2. THE Save changes button SHALL live in the section footer, SHALL be the only primary button in that section, and SHALL be disabled until the trimmed name differs from the saved name.
3. WHEN the trimmed name is empty, shorter than 2 characters, or longer than 50, THE Profile_Section SHALL show a form-level `role="alert"` and SHALL NOT call `profile.changeName`.
4. WHEN save succeeds, THE Settings_Page SHALL toast success and SHALL invalidate cached profile, group, and invitation data that renders the name.
5. THE profile form SHALL contain only the photo row and the name field. Email, password, and passkey controls SHALL sit outside that form so their buttons cannot submit a name change.
6. WHILE a name edit is unsaved, or a photo upload is in flight, THE Settings_Page SHALL keep the existing navigation guard behavior used by other dirty forms, if one already wraps settings. Otherwise it SHALL warn before leaving the page with a dirty name.

### Requirement 5: Change email with a confirmation code

**User Story:** As a user, I want to change my email only after I confirm a code sent to the new address.

#### Acceptance Criteria

1. THE Profile_Section SHALL show the current email, the help text “Changing your email requires a confirmation code sent to the new address.”, and a ghost Change email button with a pencil icon.
2. WHEN the user opens Change email, THE Email_Change_Dialog SHALL ask for the new address and a Send code action.
3. WHEN send succeeds, THE Email_Change_Dialog SHALL move to a 6-digit numeric code step, show the address the code was sent to, and start a 60-second resend cooldown.
4. THE code step SHALL offer Resend, Use a different email, Cancel, and Verify. Verify stays disabled until 6 digits are entered.
5. WHEN the code matches an unexpired challenge for that user and address, THE system SHALL set `User.email` to the new address, mark `emailVerified`, and invalidate the challenge.
6. THE system SHALL reject an address that is empty, invalid, equal to the current email, or already used by another user.
7. THE system SHALL store only a hash of the code, expire the challenge, and rate-limit send and confirm using the existing auth rate limiter.
8. WHEN email delivery is not configured, Send code SHALL fail with a visible error and SHALL NOT change `User.email`.
9. WHILE a request is in flight, THE dialog SHALL NOT close.

### Requirement 6: Password

**User Story:** As a user, I want to change my password from a row, not from a form that is always open.

#### Acceptance Criteria

1. THE Profile_Section SHALL show a Password row whose description explains that email-and-password sign-in is available.
2. BECAUSE every Knots user has a password today, THE row SHALL show Change password. It SHALL NOT show Set password.
3. WHEN the user has at least one Passkey, THE row SHALL also show Remove password. Remove asks for the current password and, on success, clears `passwordHash` so the user signs in with a passkey.
4. WHEN the user has no Passkey, Remove password SHALL NOT be shown, so the account cannot be left with no sign-in method.
5. THE change dialog SHALL ask for current password, new password, and confirmation, and SHALL show the existing password checklist (`validatePassword`: 8–128 characters, upper, lower, digit).
6. WHEN the new password does not match the confirmation, or fails `validatePassword`, or equals the current password, or the current password is wrong, THE dialog SHALL show `role="alert"` and SHALL NOT update the hash.
7. WHEN change succeeds, THE system SHALL update `passwordHash` and SHALL keep the current session. It SHALL NOT revoke other sessions in this change (sign out all devices remains the separate account action).
8. The change and remove dialogs SHALL NOT submit the profile name form.

### Requirement 7: Passkeys

**User Story:** As a user, I want to add a device passkey and remove it later.

#### Acceptance Criteria

1. THE Profile_Section SHALL show a Passkeys row with the help text that sign-in can use the device fingerprint, face, or security key, and that a passkey works without relying on the email for that ceremony.
2. WHEN the browser has no WebAuthn, THE add button SHALL be disabled and the description SHALL say passkeys are unavailable on this device.
3. WHEN the user adds a passkey, THE system SHALL run a WebAuthn registration ceremony whose user display name is the account name. An optional nickname in the dialog renames the stored credential after registration.
4. WHEN the session is older than 5 minutes, add SHALL first ask the user to confirm their current password in a dialog, and SHALL NOT start the ceremony until that password matches. This replaces Spliit’s sign-out re-auth, because Knots sessions are password-backed.
5. THE Profile_Section SHALL list each passkey in a bordered row: fingerprint icon, name, created date (medium date style in the active locale), a SYNCED or DEVICE-BOUND badge from the authenticator attachment, a BACKED UP badge when the authenticator reports backup, and a destructive delete icon button.
6. WHEN the list is empty and the query has finished, THE row SHALL show an empty hint under the add button.
7. WHEN the user confirms delete, THE system SHALL remove that credential. IF it is the last passkey and the user has no password, THE system SHALL refuse the delete.
8. Add and delete SHALL toast on success and SHALL show `role="alert"` on failure.

### Requirement 8: App preferences autosave

**User Story:** As a user, I want language, currency, timezone, and theme to apply immediately and follow me to other signed-in devices.

#### Acceptance Criteria

1. THE Preferences_Section SHALL use the title App preferences and the description “Use the same defaults and appearance on every signed-in device.”
2. THE Preferences_Section SHALL render, in order: Language, Default currency, Account timezone (with help that it sets the default for new expense times and recurring schedules, and formats timestamps), Theme. It SHALL NOT render a mascot row.
3. WHEN the user changes language, THE Settings_Page SHALL call the existing `setUserLocale` cookie write and SHALL persist the locale on the user.
4. WHEN the user changes currency or timezone, THE Settings_Page SHALL call `profile.changePreferences` immediately. It SHALL NOT require Save changes.
5. WHEN the user changes theme, THE Settings_Page SHALL call `next-themes` `setTheme` immediately and SHALL persist `light`, `dark`, or `system` on the user.
6. WHEN another signed-in device loads the app, THE stored locale and theme SHALL override the cookie and `next-themes` local value after the profile loads.
7. WHILE a preference mutation is in flight, THE section header SHALL show `SettingsSaving` with accessible text, not only a hidden spinner.
8. THE selectors SHALL reuse `LocaleSwitcher`, `CurrencySelector`, `TimezoneSelect`, and the theme select options already in the app. Triggers SHALL be full width on small screens and `sm:max-w-xs` from `sm` upward.

### Requirement 9: Notification categories

**User Story:** As a user, I want to choose email, push, or off for each kind of activity.

#### Acceptance Criteria

1. THE Notifications_Section SHALL use a bell icon, the title Notifications, the description “Choose where Knots sends activity notifications.”, and a master switch in the header.
2. WHEN the master switch is off, THE category groups SHALL be hidden. The This device group SHALL stay visible.
3. WHEN the master switch is on, THE Notifications_Section SHALL show three groups with a tinted header and a primary accent bar: Groups and friends, Expenses, Summaries.
4. Groups and friends SHALL list: Added to a group, Friend ledger, Budget alerts. Expenses SHALL list: New expense, Recurring expense, Expense edited or deleted, New comment. Summaries SHALL list: Weekly activity summary and Knots news, each with a single Coming soon badge and no channel control.
5. EACH live row SHALL use Channel_Selector. The closed label SHALL be `Off`, `Email`, `Push`, or `Email + Push`.
6. Channel_Selector SHALL open a popover at `md` and up, and a drawer below `md`, with a checkmark on selected channels and a Done button in the drawer.
7. WHEN the user toggles a channel, THE Settings_Page SHALL save that category immediately, toast on success, and roll the row back and toast an error on failure. Other rows SHALL be disabled while one save is in flight.
8. WHEN the user turns Push on for a category and this device is not subscribed, THE Settings_Page SHALL run the existing push-enable flow before saving the channel.
9. WHEN the user has no verified deliverable email, Email SHALL stay unchecked and disabled, and the section SHALL link to the email row (`#account-settings-email`).
10. WHEN push is unsupported, not configured (missing VAPID), requires an installed home screen on iOS, or permission is denied, Push SHALL be disabled and the row SHALL explain why.
11. THE system SHALL persist channels per user and category. Delivery of an event SHALL send only the enabled channels for that category, and SHALL still pass through the existing per-group member and event filters.
12. Budget alerts, new comments, and Knots news SHALL be stored and shown. THE system SHALL NOT build budgets, expense comments, or a product-news feed in this feature. Weekly activity summary and Knots news stay Coming soon and have no selector.
13. Recurring expense SHALL control email and push for the existing recurring-expense creation path. IF that path does not emit a notification today, saving the preference is enough; do not invent a new recurring scheduler.

### Requirement 10: This device

**User Story:** As a user, I want to turn push on or off for the browser I am using, without changing my other devices.

#### Acceptance Criteria

1. THE Notifications_Section SHALL end with a This device group whose description says the toggle applies only to this device.
2. WHEN push is enabled on this browser, THE row label SHALL say push is enabled and the button SHALL say Disable push notifications (`outline`).
3. WHEN push is available and off, THE row label SHALL say push is disabled and the button SHALL say Enable push notifications (primary).
4. WHEN push is unsupported, unconfigured, blocked by iOS install, or permission is denied, THE row SHALL explain that state and SHALL NOT show the enable button.
5. Enable and disable SHALL use the existing Web Push subscription helpers. Disable SHALL remove this browser’s subscription only.

### Requirement 11: Copy and accessibility

**User Story:** As a user of either locale, I want the new strings in English and Portuguese, and I want the rows to stay usable on a phone.

#### Acceptance Criteria

1. THE Settings_Page SHALL add the new strings to `messages/en-US.json` and `messages/pt-PT.json` under `ProfileSettings`.
2. Row labels and section titles SHALL wrap. They SHALL NOT truncate.
3. Interactive controls SHALL keep at least a 44px touch target.
4. Errors SHALL use `role="alert"`. Saving and coming-soon badges SHALL be exposed to assistive technology. A whole row SHALL NOT be clickable when it contains a select or several buttons.
5. THE page SHALL use theme tokens. Amber and destructive colors SHALL be limited to warnings, delete, and errors.
