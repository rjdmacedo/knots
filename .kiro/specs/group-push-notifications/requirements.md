# Requirements Document

## Introduction

This feature adds opt-in push notifications to Knots, allowing users to receive alerts when changes occur in specific groups they subscribe to. Since Knots has no authentication system (groups are accessed anonymously via URL), push subscriptions are tied to the device/browser rather than user accounts. Users can optionally associate a participant name with their subscription. The feature leverages the Web Push API with a service worker to support notifications on desktop browsers and iOS/Android when the app is added to the home screen as a PWA.

## Glossary

- **Push_Subscription_Service**: The server-side component responsible for storing, managing, and sending push notifications via the Web Push protocol
- **Service_Worker**: A background script registered in the browser that intercepts push events and displays notifications even when the app is not in the foreground
- **Notification_UI**: The client-side interface components that allow users to subscribe, unsubscribe, and manage notification preferences per group
- **Activity_System**: The existing server-side system that logs group changes (CREATE_EXPENSE, UPDATE_EXPENSE, DELETE_EXPENSE, UPDATE_GROUP) via the `logActivity` function
- **VAPID_Keys**: Voluntary Application Server Identification keys used to authenticate the application server with push services
- **Push_Endpoint**: The browser-provided URL where push messages are sent for a specific subscription
- **Participant**: A named member of a group (no account, just a name string)

## Requirements

### Requirement 1: Service Worker Registration

**User Story:** As a user, I want the app to register a service worker, so that push notifications can be received even when the app is not in the foreground.

#### Acceptance Criteria

1. WHEN the application loads in a browser that supports the Push API, THE Service_Worker SHALL register itself and reach the "activated" state within 10 seconds of page load
2. IF the browser does not support service workers or the Push API, THEN THE Notification_UI SHALL hide all notification-related controls (subscription toggle and permission prompt)
3. WHEN a push event is received containing a payload with a "title" and "body" field, THE Service_Worker SHALL display a system notification using the received title as the notification title and the received body as the notification body
4. IF a push event is received with a payload missing the "title" or "body" field, THEN THE Service_Worker SHALL display a system notification using a default title of the application name and a default body indicating a new update is available
5. WHEN a user taps a notification, THE Service_Worker SHALL open or focus the app window on the URL specified in the push payload "url" field, falling back to the app start URL (/groups) if no "url" field is present

### Requirement 2: VAPID Key Management

**User Story:** As a self-hosting administrator, I want VAPID keys to be generated and stored as environment variables, so that the server can authenticate with push services.

#### Acceptance Criteria

1. THE Push_Subscription_Service SHALL read VAPID keys from environment variables NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, validated as non-empty base64url-encoded strings via the Zod env schema
2. IF VAPID environment variables are absent or empty, THEN THE Notification_UI SHALL hide all notification-related controls and THE Push_Subscription_Service SHALL not attempt to send push messages
3. WHEN the Notification_UI creates a push subscription via the browser Push API, THE Notification_UI SHALL pass the NEXT_PUBLIC_VAPID_PUBLIC_KEY value as the applicationServerKey parameter
4. IF VAPID keys are present but fail validation, THEN THE Push_Subscription_Service SHALL prevent application startup with an error message indicating the invalid VAPID key configuration

### Requirement 3: Push Subscription Storage

**User Story:** As a user, I want my push subscription to be stored on the server linked to specific groups, so that I only receive notifications for groups I care about.

#### Acceptance Criteria

1. THE Push_Subscription_Service SHALL store push subscriptions in a database model containing the push endpoint (maximum 2048 characters), encryption keys (p256dh: maximum 256 characters, auth: maximum 256 characters), associated group ID, and optional participant name (maximum 200 characters)
2. WHEN a subscription is created for a group, THE Push_Subscription_Service SHALL persist the subscription with a reference to that group
3. IF a subscription is created referencing a group ID that does not exist in the database, THEN THE Push_Subscription_Service SHALL reject the request and return an error indicating the group was not found
4. WHEN a subscription is created with an endpoint and group ID combination that already exists, THE Push_Subscription_Service SHALL update the existing subscription record with the new encryption keys and participant name rather than creating a duplicate
5. THE Push_Subscription_Service SHALL support multiple subscriptions per endpoint across different groups, where the endpoint URL uniquely identifies a device
6. THE Push_Subscription_Service SHALL support multiple endpoints subscribed to the same group

### Requirement 4: Per-Group Opt-In Subscription

**User Story:** As a user, I want to opt in to notifications for a specific group, so that I only get notified about groups I am actively tracking.

#### Acceptance Criteria

1. WHEN a user is viewing a group page, THE Notification_UI SHALL display a control to subscribe to notifications for that group
2. WHEN a user activates the subscribe control, THE Notification_UI SHALL request browser notification permission if not already granted
3. IF the user denies browser notification permission, THEN THE Notification_UI SHALL display a message indicating that notifications cannot be enabled without permission and SHALL NOT create a push subscription
4. WHEN notification permission is granted, THE Notification_UI SHALL create a push subscription via the browser Push API and send it to the Push_Subscription_Service
5. IF the push subscription creation or server registration fails, THEN THE Notification_UI SHALL display an error message indicating the subscription could not be completed and SHALL revert the control to the unsubscribed state
6. WHILE a user is subscribed to a group, THE Notification_UI SHALL display the subscription as active with an option to unsubscribe
7. WHEN a user activates the unsubscribe control, THE Notification_UI SHALL remove the subscription from the Push_Subscription_Service and unsubscribe from the browser Push API for that group
8. WHILE a subscribe or unsubscribe operation is in progress, THE Notification_UI SHALL disable the subscription control and indicate a loading state

### Requirement 5: Optional Participant Association

**User Story:** As a user, I want to optionally associate my subscription with my participant name, so that I do not receive notifications for changes I made myself.

#### Acceptance Criteria

1. WHEN a user subscribes to a group, THE Notification_UI SHALL display an optional dropdown defaulting to no selection, populated with the group's participant names, allowing the user to associate one participant with the subscription
2. WHERE a participant is associated with a subscription, THE Push_Subscription_Service SHALL compare the subscription's stored participant ID against the activity's participantId field and exclude notifications where they match
3. WHERE no participant is associated with a subscription, THE Push_Subscription_Service SHALL send all group notifications to that subscription without filtering
4. WHILE a user is subscribed to a group, THE Notification_UI SHALL allow the user to change or remove the associated participant for that subscription
5. IF the participant associated with a subscription is deleted from the group, THEN THE Push_Subscription_Service SHALL treat that subscription as having no participant association and send all group notifications to it

### Requirement 6: Notification Dispatch on Activity

**User Story:** As a subscribed user, I want to receive a push notification when someone creates, edits, or deletes an expense in my group, so that I stay informed without checking the app.

#### Acceptance Criteria

1. WHEN an activity of type CREATE_EXPENSE, UPDATE_EXPENSE, or DELETE_EXPENSE is logged in the Activity_System, THE Push_Subscription_Service SHALL send a push notification to all subscriptions stored for that group that have not been deleted
2. WHEN the activity type is CREATE_EXPENSE, THE notification body SHALL follow the format "{actor} added \"{expenseName}\" on {groupName}" where {actor} is the participant name who performed the action, {expenseName} is the expense title, and {groupName} is the group name
3. WHEN the activity type is UPDATE_EXPENSE, THE notification body SHALL follow the format "{actor} edited \"{expenseName}\" on {groupName}" where {actor} is the participant name who performed the action, {expenseName} is the expense title, and {groupName} is the group name
4. WHEN the activity type is DELETE_EXPENSE, THE notification body SHALL follow the format "{actor} deleted \"{expenseName}\" on {groupName}" where {actor} is the participant name who performed the action, {expenseName} is the expense title, and {groupName} is the group name
5. IF a push endpoint returns an HTTP 410 (Gone) or 404 response, THEN THE Push_Subscription_Service SHALL delete that subscription from the database
6. IF a push delivery fails with any error other than HTTP 410 or 404 (including network timeouts and 5xx responses), THEN THE Push_Subscription_Service SHALL log the failure without retrying
7. IF a group has no stored subscriptions when an activity is logged, THEN THE Push_Subscription_Service SHALL skip notification dispatch without error
8. WHEN the activity type is UPDATE_GROUP, THE Push_Subscription_Service SHALL send a push notification with the format "{actor} updated the group \"{groupName}\""

### Requirement 7: PWA Compatibility for iOS Home Screen

**User Story:** As an iOS user who added Knots to my home screen, I want to receive push notifications, so that I stay informed like native app users.

#### Acceptance Criteria

1. WHEN the app is launched as a standalone PWA on iOS 16.4 or later, THE Service_Worker SHALL register successfully and handle incoming push events by displaying a system notification
2. THE manifest file SHALL include the `id` field and `display: standalone` for push notification support on iOS
3. WHILE the app is running as a standalone PWA on iOS, THE Notification_UI SHALL present the same subscription toggle, permission request flow, and status indicators as displayed in the browser experience
4. WHEN the user taps a subscription control in standalone PWA mode on iOS, THE Notification_UI SHALL trigger the push subscription request in response to that user gesture
5. IF the device runs iOS below 16.4 or does not support Web Push, THEN THE Notification_UI SHALL hide the subscription controls and display a message indicating that push notifications are not supported on this device

### Requirement 8: Subscription Management via tRPC

**User Story:** As a developer, I want push subscription CRUD operations exposed via a tRPC router, so that the client can manage subscriptions using the existing API pattern.

#### Acceptance Criteria

1. THE Push_Subscription_Service SHALL expose a tRPC mutation procedure to create a subscription accepting input validated by a Zod schema requiring endpoint (string, max 2048 characters, valid URL), keys (object with p256dh and auth as non-empty strings), and groupId (non-empty string), with an optional participantName (string, max 50 characters)
2. WHEN a create subscription mutation is called with an endpoint and groupId that match an existing subscription, THE Push_Subscription_Service SHALL update the existing subscription record with the new keys and participantName rather than creating a duplicate
3. THE Push_Subscription_Service SHALL expose a tRPC mutation procedure to delete a subscription accepting input validated by a Zod schema requiring endpoint (string, max 2048 characters) and groupId (non-empty string)
4. IF a delete subscription mutation is called with an endpoint and groupId combination that does not match any existing subscription, THEN THE Push_Subscription_Service SHALL complete without error
5. THE Push_Subscription_Service SHALL expose a tRPC query procedure to list subscriptions for a given endpoint (string, max 2048 characters), returning an array of objects each containing groupId and participantName
6. THE Push_Subscription_Service SHALL register all push subscription procedures under a dedicated sub-router within the app router, using baseProcedure with Zod input schemas following the same structure as the existing groups router procedures

### Requirement 9: Notification Content Localization

**User Story:** As a user in a non-English locale, I want push notification content to be understandable, so that notifications are useful regardless of language.

#### Acceptance Criteria

1. THE Push_Subscription_Service SHALL include a localization key and interpolation parameters in the push payload rather than pre-rendered text
2. WHEN a push event is received, THE Service_Worker SHALL determine the device locale using `navigator.language`, match it against the 19 supported locales, and resolve the notification title and body using the matched locale's translation strings and the provided localization key
3. IF the device locale does not match any of the 19 supported locales, THEN THE Service_Worker SHALL fall back to the English (en-US) translation
4. IF a localization key cannot be resolved in the target locale's translation strings, THEN THE Service_Worker SHALL fall back to the English (en-US) translation for that key
5. IF a localization key cannot be resolved in both the target locale and the English (en-US) translation, THEN THE Service_Worker SHALL display the raw localization key as the notification text
6. THE Service_Worker SHALL load translation strings from bundled locale data available within the service worker scope without depending on network requests to resolve notification content
