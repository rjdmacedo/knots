# Requirements Document

## Introduction

This feature consolidates the participant model with the user model in the Knots expense-splitting application. Currently, expenses reference a standalone Participant model (a simple name string with a group association). This change makes authenticated Users the participants in expenses, leveraging the existing GroupMembership relationship. Additionally, this feature introduces user profile management capabilities: changing passwords and updating display names.

## Glossary

- **System**: The Knots expense-splitting application backend
- **User**: An authenticated account holder with id, name, email, and passwordHash fields
- **Participant**: The legacy model containing id, name, and groupId that expenses currently reference
- **GroupMembership**: The existing join record linking a User to a Group
- **Expense**: A financial record within a group tracking who paid and who owes
- **ExpensePaidFor**: The join record linking an Expense to the users who owe a share
- **Migration**: A Prisma database schema migration that transforms the data model
- **Profile_Service**: The service layer handling user profile operations (password change, name update)
- **Password_Validator**: The component responsible for verifying password strength and correctness

## Requirements

### Requirement 1: Remove Participant Model and Reference Users Directly

**User Story:** As a developer, I want expenses to reference Users directly instead of the legacy Participant model, so that the data model is consistent and participants are always real authenticated users.

#### Acceptance Criteria

1. THE System SHALL store expense paidBy references as foreign keys to the User model instead of the Participant model
2. THE System SHALL store ExpensePaidFor records with foreign keys to the User model instead of the Participant model
3. WHEN a Group is queried for its participants, THE System SHALL return the list of Users who hold a GroupMembership for that Group
4. THE System SHALL remove the Participant model from the database schema after data migration is complete
5. WHEN an Expense is created, THE System SHALL validate that the paidBy user and all paidFor users hold active GroupMembership records in the expense's Group

### Requirement 2: Migrate Existing Expense Data

**User Story:** As a developer, I want existing expenses to be migrated from referencing Participants to referencing Users, so that historical data remains intact and queryable.

#### Acceptance Criteria

1. THE Migration SHALL create a mapping between existing Participant records and User records based on matching GroupMembership and name
2. WHEN a Participant record has a corresponding User with a GroupMembership in the same Group, THE Migration SHALL update all expense references from that Participant ID to the corresponding User ID
3. IF a Participant record cannot be matched to a User, THEN THE Migration SHALL create a placeholder User record to preserve referential integrity
4. THE Migration SHALL preserve all existing expense amounts, dates, split modes, and shares without modification
5. THE Migration SHALL be reversible through a down-migration that restores the Participant model and original references

### Requirement 3: Update Group Form to Use Group Members

**User Story:** As a user, I want the group form to show actual group members instead of free-text participant names, so that expenses are always attributed to real users.

#### Acceptance Criteria

1. WHEN a user views the group edit form, THE System SHALL display the list of current group members (Users with GroupMembership) as the participants
2. THE System SHALL remove the free-text participant name input from the group creation and edit forms
3. WHEN a new group is created, THE System SHALL automatically add the creating User as the first group member via GroupMembership
4. WHEN a user creates an expense, THE System SHALL present only Users with active GroupMembership in that Group as selectable paidBy and paidFor options

### Requirement 4: Change Password

**User Story:** As a user, I want to change my password from a profile settings page, so that I can maintain account security.

#### Acceptance Criteria

1. WHEN a user submits a password change request with a valid current password and a new password, THE Profile_Service SHALL update the user's passwordHash to the hash of the new password
2. WHEN a user submits a password change request with an incorrect current password, THE Profile_Service SHALL reject the request and return a current-password-mismatch error
3. THE Password_Validator SHALL enforce that the new password meets minimum strength requirements (at least 8 characters, containing uppercase, lowercase, and a digit)
4. IF the new password is identical to the current password, THEN THE Profile_Service SHALL reject the request and return a same-password error
5. WHEN a password change succeeds, THE System SHALL invalidate all other active sessions for that user

### Requirement 5: Change Display Name

**User Story:** As a user, I want to update my display name from a profile settings page, so that my name appears correctly across all groups and expenses.

#### Acceptance Criteria

1. WHEN a user submits a name change request with a valid new name, THE Profile_Service SHALL update the user's name field in the database
2. THE Profile_Service SHALL enforce that the new name is between 1 and 100 characters in length
3. THE Profile_Service SHALL trim leading and trailing whitespace from the submitted name before saving
4. WHEN a user's name is updated, THE System SHALL reflect the updated name in all groups where the user holds a GroupMembership without requiring additional action

### Requirement 6: Profile Settings Page

**User Story:** As a user, I want a dedicated profile settings page, so that I can manage my account details in one place.

#### Acceptance Criteria

1. THE System SHALL provide a profile settings page accessible to authenticated users
2. THE System SHALL display the user's current name and email address on the profile settings page
3. THE System SHALL provide a form to change the user's display name on the profile settings page
4. THE System SHALL provide a form to change the user's password on the profile settings page
5. WHEN a profile update operation succeeds, THE System SHALL display a success confirmation message to the user
6. WHEN a profile update operation fails, THE System SHALL display the specific error message to the user
