# Requirements Document

## Introduction

This feature renders field-level change details (diffs) in the activity feed UI. The backend already computes and returns an array of `{ field, oldValue, newValue }` on each activity record via the `changes` relation. Currently, the `ActivityItem` component only displays a summary string (e.g., "Alice updated expense 'Dinner'"). This feature adds a visual representation of individual field changes so users can see exactly what was modified.

## Glossary

- **Activity_Feed**: The page at `src/app/groups/[groupId]/activity/` that lists all group activities with infinite scroll and date grouping.
- **ActivityItem_Component**: The React component that renders a single activity row in the Activity_Feed.
- **Change_List**: A UI element within the ActivityItem_Component that displays the individual field-level changes for an activity.
- **Field_Change**: A single change record containing a field name, old value, and new value.
- **Field_Label**: A human-readable, localized display name for a raw database field name (e.g., "expenseDate" → "Date").
- **Value_Formatter**: A function that transforms raw serialized values into user-friendly display strings based on the field type (e.g., currency formatting for amounts, readable dates for timestamps).
- **Collapse_Threshold**: The number of Field_Change items (set to 3) above which the Change_List is rendered in a collapsed state by default.

## Requirements

### Requirement 1: Display Field-Level Changes

**User Story:** As a group member, I want to see the specific fields that were modified in an activity, so that I can understand exactly what changed without navigating to the expense.

#### Acceptance Criteria

1. WHEN an activity has one or more Field_Change records, THE ActivityItem_Component SHALL render a Change_List below the summary text.
2. WHEN an activity has zero Field_Change records, THE ActivityItem_Component SHALL render only the summary text without a Change_List.
3. THE Change_List SHALL display each Field_Change as a single line showing the Field_Label, old value, and new value, in the same order as the Field_Change records are provided by the backend.
4. WHEN a Field_Change has a null oldValue, THE Change_List SHALL display the change as a field addition showing only the Field_Label and the new value (e.g., "Amount: → $61.30").
5. WHEN a Field_Change has a null newValue, THE Change_List SHALL display the change as a field removal showing only the Field_Label and the old value (e.g., "Notes: Trip dinner →").
6. IF a Field_Change has both a null oldValue and a null newValue, THEN THE Change_List SHALL omit that Field_Change from the rendered output.

### Requirement 2: Human-Readable Field Labels

**User Story:** As a group member, I want field names displayed in a readable format, so that I can quickly identify which property was changed.

#### Acceptance Criteria

1. THE ActivityItem_Component SHALL map raw field names to localized Field_Label values using the next-intl translation system.
2. THE ActivityItem_Component SHALL support Field_Label mappings for the following fields: title, amount, expenseDate, category, paidBy, splitMode, isReimbursement, notes, recurrenceRule, paidFor, name, information, currency, and participants.
3. IF a field name has no defined Field_Label mapping, THEN THE ActivityItem_Component SHALL display the raw field name string unmodified as a fallback.
4. WHEN a Field_Change is rendered, THE ActivityItem_Component SHALL display the Field_Label as a prefix before the old and new values on the same line.

### Requirement 3: Value Formatting

**User Story:** As a group member, I want changed values displayed in a meaningful format, so that I can understand the actual data without interpreting raw database values.

#### Acceptance Criteria

1. WHEN the field is "amount", THE Value_Formatter SHALL display the value as a formatted currency number using the group currency.
2. WHEN the field is "expenseDate", THE Value_Formatter SHALL display the value as a localized date string.
3. WHEN the field is "isReimbursement", THE Value_Formatter SHALL display the value as a localized boolean label (e.g., "Yes" / "No").
4. WHEN the field is "paidBy" or "paidFor", THE Value_Formatter SHALL resolve participant IDs to participant names using the group participant list.
5. WHEN the field is "category", THE Value_Formatter SHALL resolve category IDs to localized category names.
6. FOR ALL other fields, THE Value_Formatter SHALL display the raw string value without transformation.

### Requirement 4: Collapsible Change List

**User Story:** As a group member, I want activities with many changes to be collapsed by default, so that the activity feed remains scannable.

#### Acceptance Criteria

1. WHEN an activity has more than the Collapse_Threshold number of changes, THE Change_List SHALL render in a collapsed state showing only the first 3 changes in the order they are returned by the backend.
2. WHILE the Change_List is in a collapsed state, THE ActivityItem_Component SHALL display a toggle control indicating the number of hidden changes (e.g., "Show 2 more changes").
3. WHILE the Change_List is in an expanded state, THE ActivityItem_Component SHALL display a toggle control with a label indicating the user can collapse the list (e.g., "Show less").
4. WHEN the user activates the toggle control on a collapsed Change_List, THE Change_List SHALL expand to show all Field_Change items.
5. WHEN the user activates the toggle control on an expanded Change_List, THE Change_List SHALL collapse back to showing only the first 3 changes.
6. WHEN an activity has the Collapse_Threshold or fewer changes, THE Change_List SHALL render all changes without a toggle control.

### Requirement 5: Visual Design and Layout

**User Story:** As a group member, I want the change details to be visually distinct from the summary but not overwhelming, so that I can scan the feed efficiently.

#### Acceptance Criteria

1. THE Change_List SHALL be rendered at one Tailwind font-size step below the activity summary text (e.g., text-xs when summary is text-sm).
2. THE Change_List SHALL use the muted-foreground text color from the existing Tailwind CSS design system.
3. THE Change_List SHALL display old and new values separated by a visible arrow indicator (→).
4. THE Change_List SHALL be indented with left padding relative to the summary text to establish visual hierarchy.
5. WHEN the user clicks or taps on the Change_List area (excluding the collapse toggle control), THE ActivityItem_Component SHALL continue to trigger the existing click-to-navigate behavior.
6. WHEN the user activates the collapse toggle control, THE ActivityItem_Component SHALL toggle the Change_List expanded state without triggering the click-to-navigate behavior.
7. THE Change_List SHALL include vertical spacing between the summary text and the first change item of at least 4px.

### Requirement 6: Internationalization Support

**User Story:** As a non-English-speaking user, I want the change display to be fully localized, so that I can understand the changes in my language.

#### Acceptance Criteria

1. THE ActivityItem_Component SHALL define all Field_Label values (as enumerated in Requirement 2, criterion 2) as translation keys within the "Activity" namespace of the next-intl message files.
2. THE ActivityItem_Component SHALL define the toggle control text as translation keys using ICU MessageFormat pluralization syntax, with a `{count}` parameter representing the number of hidden changes for the expand label and a static key for the collapse label.
3. THE Value_Formatter SHALL use the locale resolved by next-intl when formatting dates and numbers.
4. THE ActivityItem_Component SHALL add all new translation keys to the English locale file (en-US.json) as the baseline.
5. IF a translation key required by the Change_List is not defined in the active locale's message file, THEN THE ActivityItem_Component SHALL fall back to the en-US.json baseline value.

### Requirement 7: Accessibility

**User Story:** As a user relying on assistive technology, I want the change details to be accessible, so that I can understand activity changes using a screen reader.

#### Acceptance Criteria

1. THE Change_List SHALL use a semantic HTML list structure (ordered or unordered list) to convey the grouped nature of changes, where each Field_Change is a list item.
2. THE toggle control SHALL be a focusable, keyboard-activatable element with an accessible label that communicates the action and the number of remaining hidden changes (e.g., "Show 2 more changes" or "Show less").
3. THE Change_List SHALL include an aria-label attribute that states the total number of changes (e.g., "3 field changes").
4. WHEN the Change_List expands or collapses, THE toggle control SHALL update its aria-expanded attribute to "true" when expanded and "false" when collapsed.
5. THE Change_List SHALL convey the old value and new value of each Field_Change using visually hidden text labels (e.g., "from" and "to") so that screen readers announce the meaning of each value without relying on the visual arrow indicator alone.
