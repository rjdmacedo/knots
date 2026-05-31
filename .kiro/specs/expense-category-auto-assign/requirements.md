# Requirements Document

## Introduction

This feature allows the system to remember the association between expense titles and categories. When a user creates an expense and assigns a category, the system stores that association. The next time an expense with the same title is created, the category is automatically suggested/filled in, eliminating the need for repetitive manual selection.

## Glossary

- **System**: The Knots group expense-sharing application
- **Title_Category_Mapping**: Record that associates a normalized expense title with a category identifier, scoped per group
- **Normalized_Title**: Version of the expense title converted to lowercase with extra whitespace removed, used for comparison
- **Category**: Predefined classification of an expense (e.g. Food, Transport, Entertainment)
- **Group**: Context for sharing expenses among participants
- **Expense_Form**: Interface where the user creates or edits an expense

## Requirements

### Requirement 1: Save title-category association when creating an expense

**User Story:** As a user, I want the system to remember the category I assigned to an expense title, so that I do not need to select it manually next time.

#### Acceptance Criteria

1. WHEN a user creates an expense with a title and a category, THE System SHALL save the Title_Category_Mapping associating the Normalized_Title with the selected category within the Group, only if the expense is created successfully
2. WHEN a user creates an expense with a title that already has a Title_Category_Mapping in the Group, THE System SHALL update the existing mapping with the newly selected category
3. THE System SHALL normalize the expense title by converting it to lowercase, trimming leading and trailing whitespace, and collapsing consecutive internal whitespace to a single space before saving the Title_Category_Mapping
4. IF the Normalized_Title results in a string with fewer than 2 characters after normalization, THEN THE System SHALL not create or update the Title_Category_Mapping for that expense
5. IF the selected category is the default category (General), THEN THE System SHALL create or update the Title_Category_Mapping the same way as for any other category

### Requirement 2: Update title-category association when editing an expense

**User Story:** As a user, when I edit the category of an existing expense, I want the system to update the remembered association, so that future expenses with the same title use the correct category.

#### Acceptance Criteria

1. WHEN a user edits an expense not marked as reimbursement and changes the category, THE System SHALL create or update the Title_Category_Mapping for the corresponding Normalized_Title with the new category within the Group
2. WHEN a user edits the title of an expense not marked as reimbursement, THE System SHALL create or update the Title_Category_Mapping for the new Normalized_Title (normalized to lowercase with trimmed whitespace) with the current category within the Group, leaving the mapping for the previous title unchanged
3. WHEN a user edits both the title and category of an expense not marked as reimbursement, THE System SHALL create or update the Title_Category_Mapping for the new Normalized_Title with the new category within the Group, leaving the mapping for the previous title unchanged
4. WHEN a user edits an expense marked as reimbursement, THE System SHALL ignore the changes for Title_Category_Mapping purposes

### Requirement 3: Auto-fill category based on title

**User Story:** As a user, when I type the title of a new expense, I want the category to be automatically filled based on previous expenses with the same title, to save time.

#### Acceptance Criteria

1. WHEN a user finishes entering the title in the Expense_Form (field loses focus) and a Title_Category_Mapping exists for the corresponding Normalized_Title in the Group, THE System SHALL automatically fill the category field with the mapped category
2. WHEN a user finishes entering the title in the Expense_Form (field loses focus) and no Title_Category_Mapping exists for the corresponding Normalized_Title in the Group, THE System SHALL keep the AI-extracted category if available, otherwise keep the default category (General)
3. WHILE the category field is auto-filled by the Title_Category_Mapping, THE System SHALL allow the user to manually change the selected category
4. IF a Title_Category_Mapping exists for a title but the mapped category is no longer valid in the Group, THEN THE System SHALL treat the title as if no mapping exists and apply the fallback behavior from criterion 2

### Requirement 4: Group-scoped mapping

**User Story:** As a user of multiple groups, I want title-category associations to be independent per group, so that different categories can be used for the same title in different groups.

#### Acceptance Criteria

1. THE System SHALL maintain independent Title_Category_Mappings for each Group, shared among all participants in the same Group
2. WHEN a user creates an expense with a Normalized_Title that already has a Title_Category_Mapping in a different Group, THE System SHALL create an independent mapping in the current Group without altering the existing mapping in the other Group
3. WHEN the System looks up the Title_Category_Mapping to auto-fill the category, THE System SHALL consider only mappings belonging to the Group where the expense is being created
4. WHEN a Group is deleted, THE System SHALL delete all Title_Category_Mappings associated with that Group

### Requirement 5: Mapping priority over AI extraction

**User Story:** As a user, I want my manual category choice to take priority over the AI suggestion, so that the system respects my preferences.

#### Acceptance Criteria

1. WHEN a Title_Category_Mapping exists for an expense's Normalized_Title in the Group, THE System SHALL fill the category field with the category from the Title_Category_Mapping regardless of whether AI extraction is enabled or disabled
2. WHEN no Title_Category_Mapping exists for an expense's Normalized_Title in the Group and AI extraction is enabled, THE System SHALL fill the category field with the category suggested by AI
3. IF AI extraction is enabled and extraction fails or does not return a valid category, THEN THE System SHALL keep the default category (General)
4. WHEN no Title_Category_Mapping exists for an expense's Normalized_Title in the Group and AI extraction is disabled, THE System SHALL keep the default category (General)

### Requirement 6: Exclude reimbursement categories

**User Story:** As a user, I want expenses marked as reimbursement not to affect the title-category mapping, so that the "Payment" category is not incorrectly associated with common titles.

#### Acceptance Criteria

1. WHEN a user creates an expense marked as reimbursement, THE System SHALL not create or update any Title_Category_Mapping for that expense's Normalized_Title within the Group
2. WHEN a user edits an expense and changes the reimbursement field from false to true, THE System SHALL preserve the existing Title_Category_Mapping for the Normalized_Title without modifications
3. WHEN a user edits an expense marked as reimbursement (changing title or category), THE System SHALL not create or update any Title_Category_Mapping for that expense's Normalized_Title within the Group
4. WHEN a user creates an expense not marked as reimbursement with a title whose Normalized_Title has no Title_Category_Mapping in the Group (because it was used only in reimbursement expenses), THE System SHALL create a new Title_Category_Mapping associating the Normalized_Title with the selected category within the Group
