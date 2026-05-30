# Requirements Document

## Introduction

The Stats tab in Knots currently displays only three basic totals: total group spending, user's total spending, and user's share. This feature enhances the Stats dashboard with comprehensive analytics including category breakdowns, participant rankings, time-based trends, useful aggregate metrics, and detailed balance information. The enhanced dashboard provides group members with deeper insight into spending patterns and financial relationships within the group.

## Glossary

- **Stats_Dashboard**: The main statistics page rendered at `/groups/[groupId]/stats`, responsible for displaying all analytics sections.
- **Stats_Procedure**: The tRPC server procedure that computes and returns statistics data for a given group.
- **Expense**: A financial record within a group, containing an amount, payer, category, date, and split information among participants.
- **Participant**: A member of a group who can pay for or be included in expenses.
- **Category**: A classification label for an expense (e.g., Food and Drink, Transportation, Entertainment), organized by grouping.
- **Reimbursement**: A special expense type representing a payment between participants to settle debts; excluded from spending statistics.
- **Net_Balance**: The difference between what a participant paid and what their fair share is across all group expenses.
- **Currency**: The group's configured currency used for formatting and displaying monetary values.

## Requirements

### Requirement 1: Spending by Category Breakdown

**User Story:** As a group member, I want to see how much was spent in each category, so that I can understand where the group's money goes.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute the total spending per Category for all non-reimbursement expenses in the group.
2. WHEN category spending data is available, THE Stats_Dashboard SHALL display a visual chart (bar or pie) showing the spending distribution across categories.
3. IF an expense has a categoryId of 0 (no assigned category), THEN THE Stats_Dashboard SHALL group that expense under an "Uncategorized" label in the breakdown.
4. THE Stats_Dashboard SHALL sort categories (including "Uncategorized") by total amount in descending order.
5. THE Stats_Dashboard SHALL display both the absolute amount and the percentage of total (rounded to one decimal place) for each category.

### Requirement 2: Participant Spending Ranking

**User Story:** As a group member, I want to see who paid the most in the group, so that I can understand each person's contribution.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute the total amount each Participant paid across all non-reimbursement expenses.
2. WHEN participant spending data is available, THE Stats_Dashboard SHALL display participants ranked from highest to lowest total payment, including participants with a total of zero.
3. IF two or more Participants have the same total payment amount, THEN THE Stats_Dashboard SHALL display them in alphabetical order by participant name.
4. WHEN participant spending data is available, THE Stats_Dashboard SHALL show for each Participant the absolute amount and the percentage of total group spending, with the percentage rounded to one decimal place.

### Requirement 3: Expense Distribution per Participant

**User Story:** As a group member, I want to see the expense distribution per participant visually, so that I can quickly grasp who owes whom.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute each Participant's total paid amount and total share owed across all non-reimbursement expenses in the group.
2. THE Stats_Dashboard SHALL display a bar chart comparing what each Participant paid versus their fair share, with both values visible per Participant.
3. THE Stats_Dashboard SHALL use color coding to distinguish between participants who overpaid (paid more than their fair share) and those who underpaid (paid less than their fair share), where the threshold is a Net_Balance of zero.
4. THE Stats_Dashboard SHALL order participants by the absolute difference between their paid amount and fair share, in descending order (largest imbalance first).

### Requirement 4: Spending Over Time

**User Story:** As a group member, I want to see spending trends over time, so that I can identify patterns in the group's expenses.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL aggregate non-reimbursement expense amounts by calendar month, grouping expenses by the month and year of their expense date.
2. WHEN spending-over-time data is available, THE Stats_Dashboard SHALL display a bar chart showing the total spending amount for each time period.
3. THE Stats_Dashboard SHALL order time periods chronologically from earliest to most recent along the horizontal axis.
4. IF a calendar month between the earliest and latest expense months contains no non-reimbursement expenses, THEN THE Stats_Dashboard SHALL display that month with a zero spending amount.
5. THE Stats_Dashboard SHALL label each time period on the chart with a locale-formatted month and year identifier.

### Requirement 5: Month-over-Month Comparison

**User Story:** As a group member, I want to compare spending between months, so that I can see if spending is increasing or decreasing.

#### Acceptance Criteria

1. WHEN the group has expenses spanning at least two calendar months, THE Stats_Procedure SHALL compute the total non-reimbursement spending for the most recent calendar month containing expenses and the calendar month immediately preceding it, and return both the absolute difference and the percentage change between them.
2. WHEN month-over-month data is available, THE Stats_Dashboard SHALL display the absolute spending difference and the percentage change, formatted as currency and percentage values respectively.
3. WHEN spending in the most recent month is greater than the previous month, THE Stats_Dashboard SHALL display an upward directional indicator alongside the difference values.
4. WHEN spending in the most recent month is less than the previous month, THE Stats_Dashboard SHALL display a downward directional indicator alongside the difference values.
5. IF spending in the most recent month equals the previous month, THEN THE Stats_Dashboard SHALL display a neutral indicator with a zero difference value.
6. IF the group has expenses in only one calendar month, THEN THE Stats_Dashboard SHALL omit the month-over-month comparison section entirely.

### Requirement 6: Daily Average Spending

**User Story:** As a group member, I want to know the daily average spending, so that I can estimate future costs.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute the daily average spending by dividing total non-reimbursement spending by the number of days between the first and last expense dates (inclusive), where the expense date is the user-assigned date of each Expense.
2. THE Stats_Dashboard SHALL display the daily average as a monetary value formatted using the group's configured Currency and the user's locale.
3. IF the group has expenses on only one day, THEN THE Stats_Procedure SHALL use that single day's total as the daily average.
4. IF the group has no non-reimbursement expenses, THEN THE Stats_Dashboard SHALL omit the daily average display.

### Requirement 7: Expense Count and Aggregate Metrics

**User Story:** As a group member, I want to see summary metrics like total number of expenses, average expense value, largest expense, and most recent expense, so that I have a quick overview of group activity.

#### Acceptance Criteria

1. THE Stats_Procedure SHALL compute the total number of non-reimbursement expenses in the group.
2. IF the group contains one or more non-reimbursement expenses, THEN THE Stats_Procedure SHALL compute the average expense amount by dividing total non-reimbursement spending by the number of non-reimbursement expenses.
3. IF the group contains one or more non-reimbursement expenses, THEN THE Stats_Procedure SHALL identify the expense with the highest amount among non-reimbursement expenses and return its title, amount, and date. IF multiple expenses share the highest amount, THEN THE Stats_Procedure SHALL return the one with the most recent createdAt timestamp.
4. IF the group contains one or more non-reimbursement expenses, THEN THE Stats_Procedure SHALL identify the non-reimbursement expense with the most recent createdAt timestamp and return its title, amount, and date.
5. THE Stats_Dashboard SHALL display all four metrics (count, average, largest, most recent) in a summary section.
6. IF the group has no non-reimbursement expenses, THEN THE Stats_Dashboard SHALL display a count of zero and SHALL omit the average, largest, and most recent metrics from the summary section.

### Requirement 8: Net Balance per Participant

**User Story:** As a group member, I want to see the net balance for each participant, so that I know who owes money and who is owed.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute the Net_Balance for each Participant by subtracting their total share from their total paid amount across all non-reimbursement expenses in the group.
2. WHEN Net_Balance data is available, THE Stats_Dashboard SHALL display each Participant's Net_Balance formatted as a currency value, with a positive value indicating they are owed money and a negative value indicating they owe money.
3. THE Stats_Dashboard SHALL display positive Net_Balance values in a green-toned color and negative Net_Balance values in a red-toned color.
4. THE Stats_Dashboard SHALL sort participants by Net_Balance in descending order (most owed first).
5. IF a Participant's Net_Balance equals zero, THEN THE Stats_Dashboard SHALL display that Participant with a neutral style distinct from both positive and negative balances.

### Requirement 9: Percentage of Total Paid vs Fair Share

**User Story:** As a group member, I want to see what percentage of the total each person paid compared to their fair share, so that I can see imbalances at a glance.

#### Acceptance Criteria

1. WHEN the Stats_Dashboard loads, THE Stats_Procedure SHALL compute for each Participant the percentage of total non-reimbursement group spending they paid and the percentage that represents their fair share, each rounded to one decimal place.
2. THE Stats_Dashboard SHALL display both percentages side by side for each Participant, formatted with a percent symbol and one decimal digit.
3. IF a Participant's paid percentage differs from their fair share percentage, THEN THE Stats_Dashboard SHALL use distinct color styling to differentiate participants who paid more than their fair share from those who paid less than their fair share.
4. IF the group has no non-reimbursement expenses, THEN THE Stats_Procedure SHALL omit the percentage of total paid vs fair share computation.

### Requirement 10: Internationalization Support

**User Story:** As a group member using the app in my language, I want all new stats labels and descriptions to be translated, so that the experience is consistent.

#### Acceptance Criteria

1. THE Stats_Dashboard SHALL use next-intl translation keys for all user-facing text (labels, descriptions, tooltips, and empty-state messages) in the enhanced stats sections, with no hardcoded user-visible strings in the component source.
2. THE Stats_Dashboard SHALL format all monetary values using the group's configured Currency and the user's locale via the existing formatCurrency utility.
3. THE Stats_Dashboard SHALL format all date values according to the user's locale via the existing formatDate utility.
4. THE Stats_Dashboard SHALL provide translation keys for all new user-facing strings in every locale file present in the messages directory, falling back to the en-US value when a translation for the user's locale is not yet available.

### Requirement 11: Loading and Empty States

**User Story:** As a group member, I want to see appropriate feedback while stats are loading or when there is no data, so that I understand the current state of the page.

#### Acceptance Criteria

1. WHILE the Stats_Procedure is fetching data, THE Stats_Dashboard SHALL display skeleton placeholders that match the layout dimensions of each stats section (category breakdown, participant ranking, spending over time, aggregate metrics, and balance sections).
2. IF the group has no non-reimbursement expenses, THEN THE Stats_Dashboard SHALL display an empty state message indicating that no spending data is available and that expenses must be added before statistics can be shown.
3. WHEN data finishes loading successfully, THE Stats_Dashboard SHALL replace skeleton placeholders with the computed statistics without causing visible layout shift.
4. IF the Stats_Procedure fails to return data due to a network or server error, THEN THE Stats_Dashboard SHALL display an error message indicating that statistics could not be loaded and provide an option to retry the request.
