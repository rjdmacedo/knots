# Implementation Plan: Enhanced Stats Dashboard

## Overview

This plan implements the enhanced stats dashboard by first creating the pure computation module (`src/lib/stats.ts`), then extending the tRPC procedure, building the UI components, adding i18n keys, and wiring everything together. Property-based tests validate correctness properties from the design, and unit tests cover edge cases.

## Tasks

- [x] 1. Create computation module with types and core functions

  - [x] 1.1 Create `src/lib/stats.ts` with type definitions and category breakdown function

    - Define all TypeScript interfaces: `CategoryBreakdownItem`, `ParticipantRankingItem`, `ExpenseDistributionItem`, `MonthlySpendingItem`, `MonthOverMonthData`, `AggregateMetricsData`, `NetBalanceItem`, `PaidVsShareItem`
    - Define the `Expense` and `Participant` input types matching `getGroupExpenses` return shape
    - Implement `computeCategoryBreakdown`: filter out reimbursements, group by category, compute amounts and percentages (one decimal), sort descending by amount, map categoryId=0 to "Uncategorized"
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 1.2 Implement participant ranking and expense distribution functions in `src/lib/stats.ts`

    - Implement `computeParticipantRanking`: compute total paid per participant (including zero-payers), calculate percentage of total, sort descending by totalPaid with alphabetical tiebreaker
    - Implement `computeExpenseDistribution`: compute paid vs share per participant using existing `calculateShare` logic from `src/lib/totals.ts`, compute difference, sort by absolute difference descending
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.4_

  - [x] 1.3 Implement time-based computation functions in `src/lib/stats.ts`

    - Implement `computeSpendingOverTime`: aggregate non-reimbursement expenses by calendar month of expenseDate, fill gaps with zero-amount months, sort chronologically
    - Implement `computeMonthOverMonth`: take monthly data, compare last two months, compute absolute difference and percentage change, return null if fewer than 2 months
    - Implement `computeDailyAverage`: compute total non-reimbursement spending divided by days between earliest and latest expenseDate (inclusive), return null if no expenses
    - _Requirements: 4.1, 4.3, 4.4, 5.1, 5.6, 6.1, 6.3, 6.4_

  - [x] 1.4 Implement aggregate metrics and balance functions in `src/lib/stats.ts`
    - Implement `computeAggregateMetrics`: count non-reimbursement expenses, compute average, find largest (most recent createdAt as tiebreaker), find most recent by createdAt
    - Implement `computeNetBalances`: compute paid - share per participant, sort by netBalance descending
    - Implement `computePaidVsSharePercentages`: compute paid% and share% per participant (one decimal), return empty if no expenses
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.4, 9.1, 9.4_

- [x] 2. Property-based tests for computation module

  - [x] 2.1 Write property test for category aggregation correctness

    - **Property 1: Category aggregation correctness**
    - Generate random expense arrays with varying categories and amounts; verify sum of category amounts equals total non-reimbursement spending and each percentage equals amount/total rounded to one decimal
    - **Validates: Requirements 1.1, 1.5**

  - [x] 2.2 Write property test for category descending sort

    - **Property 2: Category descending sort**
    - Generate expenses producing multiple categories; verify output is sorted by amount in non-increasing order
    - **Validates: Requirements 1.4**

  - [x] 2.3 Write property test for conservation of money (net balances sum to zero)

    - **Property 3: Conservation of money**
    - Generate random expenses and participants; verify sum of all netBalance values equals zero within floating-point tolerance
    - **Validates: Requirements 3.1, 8.1**

  - [x] 2.4 Write property test for participant ranking sort with tiebreaker

    - **Property 4: Participant ranking sort with tiebreaker**
    - Generate expenses and participants; verify ranking is sorted by totalPaid descending, with alphabetical tiebreaker
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.5 Write property test for expense distribution imbalance sort

    - **Property 5: Expense distribution imbalance sort**
    - Generate expenses and participants; verify output sorted by absolute difference descending
    - **Validates: Requirements 3.4**

  - [x] 2.6 Write property test for monthly aggregation conservation

    - **Property 6: Monthly aggregation conservation**
    - Generate expenses; verify sum of monthly amounts equals total non-reimbursement spending
    - **Validates: Requirements 4.1**

  - [x] 2.7 Write property test for monthly chronological ordering

    - **Property 7: Monthly chronological ordering**
    - Generate expenses spanning multiple months; verify output is in strictly chronological order
    - **Validates: Requirements 4.3**

  - [x] 2.8 Write property test for month-over-month computation correctness

    - **Property 8: Month-over-month computation correctness**
    - Generate two consecutive months with known totals; verify absoluteDifference and percentageChange formulas
    - **Validates: Requirements 5.1**

  - [x] 2.9 Write property test for daily average computation correctness

    - **Property 9: Daily average computation correctness**
    - Generate expenses spanning multiple days; verify daily average equals total / days (inclusive)
    - **Validates: Requirements 6.1, 6.3**

  - [x] 2.10 Write property test for aggregate metrics correctness

    - **Property 10: Aggregate metrics correctness**
    - Generate non-empty expense sets; verify totalCount and averageAmount
    - **Validates: Requirements 7.1, 7.2**

  - [x] 2.11 Write property test for extreme expense identification

    - **Property 11: Extreme expense identification**
    - Generate expenses; verify largestExpense has max amount (most recent createdAt tiebreaker) and mostRecentExpense has latest createdAt
    - **Validates: Requirements 7.3, 7.4**

  - [x] 2.12 Write property test for net balance descending sort
    - **Property 12: Net balance descending sort**
    - Generate expenses and participants; verify netBalances sorted by netBalance descending
    - **Validates: Requirements 8.4**

- [x] 3. Checkpoint - Verify computation module

  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend tRPC procedure and add i18n keys

  - [x] 4.1 Extend `src/trpc/routers/groups/stats/get.procedure.ts` to return all new stats

    - Import computation functions from `src/lib/stats.ts`
    - Import `calculateShare` from `src/lib/totals.ts` for share computation
    - Fetch group participants from Prisma (needed for ranking, distribution, balances)
    - Call all computation functions with the expenses and participants arrays
    - Return the expanded response object alongside existing fields
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1_

  - [x] 4.2 Add translation keys to `messages/en-US.json` for all new stats sections
    - Add keys under `Stats` namespace for: CategoryBreakdown, ParticipantRanking, ExpenseDistribution, SpendingOverTime, MonthOverMonth, DailyAverage, AggregateMetrics, NetBalances, PaidVsShare
    - Include titles, descriptions, empty state messages, labels for chart axes, and directional indicators
    - Add keys for error state and retry button text
    - _Requirements: 10.1, 10.4, 11.2, 11.4_

- [x] 5. Build UI components for stats sections

  - [x] 5.1 Create `src/app/groups/[groupId]/stats/category-breakdown.tsx`

    - Render a bar chart using shadcn ChartContainer with Recharts BarChart showing spending per category
    - Display category name, amount (formatted with formatCurrency), and percentage for each bar
    - Handle empty state when no categories exist
    - Use `useTranslations('Stats.CategoryBreakdown')` for all labels
    - _Requirements: 1.2, 1.5, 10.1, 10.2, 11.2_

  - [x] 5.2 Create `src/app/groups/[groupId]/stats/participant-ranking.tsx`

    - Render a ranked list of participants with their total paid and percentage
    - Format amounts using formatCurrency and show percentage with one decimal
    - Handle empty state
    - Use `useTranslations('Stats.ParticipantRanking')` for all labels
    - _Requirements: 2.2, 2.4, 10.1, 10.2_

  - [x] 5.3 Create `src/app/groups/[groupId]/stats/expense-distribution.tsx`

    - Render a grouped bar chart comparing paid vs share per participant
    - Apply color coding: green-toned for overpaid (positive difference), red-toned for underpaid
    - Handle empty state
    - Use `useTranslations('Stats.ExpenseDistribution')` for all labels
    - _Requirements: 3.2, 3.3, 10.1, 10.2_

  - [x] 5.4 Create `src/app/groups/[groupId]/stats/spending-over-time.tsx`

    - Render a bar chart with monthly spending amounts on Y-axis and locale-formatted month/year labels on X-axis
    - Handle empty state
    - Use `useTranslations('Stats.SpendingOverTime')` for all labels
    - _Requirements: 4.2, 4.3, 4.5, 10.1, 10.2, 10.3_

  - [x] 5.5 Create `src/app/groups/[groupId]/stats/month-over-month.tsx`

    - Render a card showing absolute difference and percentage change between last two months
    - Display upward/downward/neutral directional indicator based on comparison
    - Omit section entirely when data is null (fewer than 2 months)
    - Use `useTranslations('Stats.MonthOverMonth')` for all labels
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.1, 10.2_

  - [x] 5.6 Create `src/app/groups/[groupId]/stats/daily-average.tsx` and `src/app/groups/[groupId]/stats/aggregate-metrics.tsx`

    - `daily-average.tsx`: Render a single metric card with the daily average formatted as currency; omit when null
    - `aggregate-metrics.tsx`: Render a summary card with total count, average amount, largest expense (title + amount + date), and most recent expense (title + amount + date); handle null fields when no expenses
    - Use `useTranslations` for all labels and formatCurrency/formatDate for values
    - _Requirements: 6.1, 6.2, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.1, 10.2, 10.3_

  - [x] 5.7 Create `src/app/groups/[groupId]/stats/net-balances.tsx` and `src/app/groups/[groupId]/stats/paid-vs-share.tsx`
    - `net-balances.tsx`: Render a list of participants with color-coded net balance (green for positive, red for negative, neutral for zero)
    - `paid-vs-share.tsx`: Render side-by-side paid% vs share% per participant with color differentiation for imbalances
    - Handle empty states for both components
    - Use `useTranslations` for all labels
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2_

- [x] 6. Wire components into the stats page

  - [x] 6.1 Update `src/app/groups/[groupId]/stats/page.client.tsx` to render all new sections
    - Import all new card components
    - Destructure the expanded tRPC response data
    - Render each section in a logical layout order: existing totals, category breakdown, participant ranking, expense distribution, spending over time, month-over-month, daily average, aggregate metrics, net balances, paid vs share
    - Add skeleton placeholders for each new section during loading state
    - Display error state with retry button when query fails
    - Display empty state message when group has no non-reimbursement expenses
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 7. Checkpoint - Full integration verification

  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Unit tests for computation module

  - [x] 8.1 Write unit tests in `src/lib/__tests__/stats.test.ts`
    - Test empty expense list returns appropriate nulls/empty arrays for all functions
    - Test single expense produces correct breakdown across all functions
    - Test known multi-expense scenario with manually computed expected values
    - Test reimbursements are excluded from all computations
    - Test month gap filling (months with zero spending appear in output)
    - Test tiebreaker scenarios for largest expense and alphabetical participant ordering
    - Test division-by-zero edge cases return null appropriately
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.4, 5.6, 6.3, 6.4, 7.1, 7.3, 8.1_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The computation module (`src/lib/stats.ts`) is pure and testable without React or tRPC dependencies
- All monetary values are in minor units (cents) as integers; percentages use `Math.round(value * 10) / 10` for one decimal
- The existing `calculateShare` function from `src/lib/totals.ts` is reused for share computation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    {
      "id": 2,
      "tasks": [
        "2.1",
        "2.2",
        "2.3",
        "2.4",
        "2.5",
        "2.6",
        "2.7",
        "2.8",
        "2.9",
        "2.10",
        "2.11",
        "2.12",
        "4.2"
      ]
    },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["8.1"] }
  ]
}
```
