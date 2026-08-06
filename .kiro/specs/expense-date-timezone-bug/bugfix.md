# Bugfix Requirements Document

## Introduction

When a user edits an expense and selects a date via the DatePicker calendar, the persisted date is shifted one day earlier than the user-selected date. This occurs because the calendar creates a `Date` object at midnight in the user's local timezone (e.g., `2026-06-01T00:00:00+02:00`), which when serialized to UTC becomes the previous day (e.g., `2026-05-31T22:00:00.000Z`). The server then stores this UTC value, resulting in a one-day-earlier date.

This off-by-one error also causes the duplicate expense detection feature to fail, because the stored date does not match the user's intended date when comparing against existing expenses.

Additionally, when the calendar DatePicker opens, it does not focus on the correct month: when editing an expense with an existing date, the calendar should display the month of that date, and when creating a new expense (no date yet), it should display the current month (today's date).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user selects a date in the expense DatePicker (e.g., 01/06/2026) and the user's local timezone is ahead of UTC (positive UTC offset) THEN the system stores the expense date as the previous day (e.g., 31/05/2026) due to the midnight local time being converted to the previous day in UTC

1.2 WHEN a user edits an expense and changes the date to a date where a duplicate expense already exists THEN the duplicate detection does not trigger because the stored date (shifted by timezone) does not match the intended date used in the comparison

1.3 WHEN a user edits an existing expense and opens the DatePicker calendar THEN the calendar does not focus on the month of the expense's already-selected date, showing an incorrect month instead

1.4 WHEN a user creates a new expense and opens the DatePicker calendar THEN the calendar does not focus on today's date/month

### Expected Behavior (Correct)

2.1 WHEN a user selects a date in the expense DatePicker (e.g., 01/06/2026) THEN the system SHALL store the expense with exactly that calendar date (01/06/2026) regardless of the user's local timezone offset

2.2 WHEN a user edits an expense and changes the date to a date where a duplicate expense already exists THEN the system SHALL correctly detect the duplicate by comparing against the user-intended calendar date

2.3 WHEN a user edits an existing expense and opens the DatePicker calendar THEN the system SHALL display the calendar focused on the month of the expense's already-selected date

2.4 WHEN a user creates a new expense and opens the DatePicker calendar THEN the system SHALL display the calendar focused on today's date (current month)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user creates a new expense with a selected date THEN the system SHALL CONTINUE TO persist the expense and display the correct date in expense lists and detail views

3.2 WHEN a user is in the UTC timezone (zero offset) THEN the system SHALL CONTINUE TO store dates correctly as it does today

3.3 WHEN expenses are displayed in grouped lists (by date) THEN the system SHALL CONTINUE TO group them by the correct calendar date

3.4 WHEN recurring expense dates are calculated from an expense date THEN the system SHALL CONTINUE TO compute the next recurrence date correctly

3.5 WHEN the DatePicker calendar is opened and a date is already selected THEN the system SHALL CONTINUE TO visually highlight the selected date in the calendar

3.6 WHEN the user selects a date from the calendar THEN the system SHALL CONTINUE TO close the popover and update the displayed date value
