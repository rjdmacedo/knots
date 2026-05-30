# Requirements: Activity Diff Changelog

## Requirement 1: ActivityChange Data Model

### Acceptance Criteria

1.1 A new `ActivityChange` Prisma model exists with fields: `id` (cuid), `activityId` (foreign key), `field` (string), `oldValue` (optional string), `newValue` (optional string).

1.2 The `ActivityChange` model has a relation to `Activity` with `onDelete: Cascade`, so deleting an Activity removes its associated changes.

1.3 The `Activity` model has a `changes` relation field pointing to `ActivityChange[]`.

1.4 An index exists on `ActivityChange.activityId` for efficient querying.

1.5 A Prisma migration is generated and applied for the schema changes.

## Requirement 2: Expense Diff Computation

### Acceptance Criteria

2.1 A `computeExpenseChanges(existing, updated)` function exists in `src/lib/activity-diff.ts` that returns an array of `FieldChange` objects.

2.2 The function tracks changes to these expense fields: `title`, `amount`, `expenseDate`, `category`, `paidBy`, `splitMode`, `isReimbursement`, `notes`, `recurrenceRule`, `paidFor`.

2.3 Each `FieldChange` contains `field` (field name), `oldValue` (previous value as string or null), and `newValue` (new value as string or null).

2.4 Fields that have not changed between old and new state produce no `FieldChange` entry.

2.5 When both old and new values are identical, the function returns an empty array.

2.6 Null/undefined values are handled gracefully — `oldValue` or `newValue` is set to `null` when the value is absent.

## Requirement 3: Group Diff Computation

### Acceptance Criteria

3.1 A `computeGroupChanges(existing, updated)` function exists in `src/lib/activity-diff.ts` that returns an array of `FieldChange` objects.

3.2 The function tracks changes to these group fields: `name`, `information`, `currency`, `participants`.

3.3 Participant changes are represented by serializing the participant name lists (old vs new).

3.4 Fields that have not changed produce no `FieldChange` entry.

## Requirement 4: Enhanced logActivity Function

### Acceptance Criteria

4.1 The `logActivity` function accepts an optional `changes` parameter of type `FieldChange[]` in its `extra` argument.

4.2 When `changes` is provided and non-empty, `ActivityChange` records are created in the same database operation as the `Activity` record (nested Prisma create).

4.3 When `changes` is undefined or empty, no `ActivityChange` records are created (backward compatible with existing callers).

4.4 Each created `ActivityChange` record references the parent `Activity` via `activityId`.

## Requirement 5: Integration with Expense Operations

### Acceptance Criteria

5.1 The `updateExpense` function computes expense changes by comparing the existing expense with the new form values before logging the activity.

5.2 The `createExpense` function logs initial field values as changes (oldValue = null, newValue = initial value) for key fields: title, amount, paidBy.

5.3 The `deleteExpense` function logs final field values as changes (oldValue = final value, newValue = null) for key fields: title, amount.

5.4 All existing `logActivity` call sites continue to work without modification (no breaking changes).

## Requirement 6: Integration with Group Operations

### Acceptance Criteria

6.1 The `updateGroup` function computes group changes by comparing the existing group with the new form values before logging the activity.

6.2 The computed changes are passed to `logActivity` alongside the existing parameters.

## Requirement 7: Enhanced Activity Querying

### Acceptance Criteria

7.1 The `getActivities` function returns activities with their associated `changes` included.

7.2 Each activity in the response includes a `changes` array (may be empty for older activities without diffs).

7.3 The query uses the `activityId` index for efficient joins.
