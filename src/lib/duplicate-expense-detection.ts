/**
 * Duplicate Expense Detection utilities.
 *
 * Provides title normalization and date proximity checking used by the
 * duplicate detection flow when creating or editing expenses.
 */

export type SimilarityIndicator =
  | 'similar-title'
  | 'same-amount'
  | 'close-in-date'
  | 'same-category'

export type DuplicateCheckResult = {
  hasDuplicates: boolean
  matches: Array<{
    id: string
    title: string
    amount: number // minor units
    expenseDate: Date
    categoryId: number
    isDateProximate: boolean // within 7-day window
  }>
}

/**
 * Normalizes an expense title for case-insensitive, trimmed comparison.
 */
export function normalizeExpenseTitle(title: string): string {
  return title.trim().toLowerCase()
}

/**
 * Determines whether two dates fall within a configurable proximity window.
 *
 * @param dateA - First date
 * @param dateB - Second date
 * @param windowDays - Maximum number of days apart (inclusive). Defaults to 7.
 * @returns true if the absolute difference in days between the dates is ≤ windowDays
 */
export function isDateProximate(
  dateA: Date,
  dateB: Date,
  windowDays: number = 7,
): boolean {
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime())
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= windowDays
}

/**
 * Represents an existing expense in memory for duplicate matching.
 */
export type ExistingExpense = {
  id: string
  title: string
  amount: number // minor units
  expenseDate: Date
  categoryId: number
  groupId: string | null
}

/**
 * Checks whether a reinforcement factor (title, date, or category) matches between input and expense.
 * Amount is the mandatory base factor; title, date proximity, and category are reinforcements.
 *
 * @returns true if at least one reinforcement factor matches.
 */
export function hasReinforcementFactor(
  input: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
  },
  expense: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
  },
): boolean {
  if (
    normalizeExpenseTitle(input.title) === normalizeExpenseTitle(expense.title)
  ) {
    return true
  }
  if (isDateProximate(input.expenseDate, expense.expenseDate)) {
    return true
  }
  if (
    input.categoryId != null &&
    expense.categoryId != null &&
    input.categoryId === expense.categoryId &&
    input.categoryId !== 0 // 0 is "Uncategorized", not meaningful
  ) {
    return true
  }
  return false
}

/**
 * Pure function that finds duplicate matches from a list of existing expenses.
 *
 * A potential duplicate is flagged when:
 * - Amount matches exactly (mandatory base factor), AND
 * - At least one reinforcement factor also matches: title OR date proximity
 *
 * Rationale: in shared expense groups, different users often create the same expense
 * with different titles or imprecise dates, but the amount is always the same.
 * Amount alone is the strongest signal; title or date proximity reinforces it.
 *
 * @param existingExpenses - The pool of expenses to search for duplicates in
 * @param input - The expense being submitted
 * @returns DuplicateCheckResult with matched expenses
 */
export function findDuplicateMatches(
  existingExpenses: ExistingExpense[],
  input: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
    groupId: string | null
    excludeExpenseId?: string
  },
): DuplicateCheckResult {
  const matches = existingExpenses
    .filter((expense) => {
      // Scope isolation: only match within same context
      if (expense.groupId !== input.groupId) return false

      // Self-exclusion: never match the expense being edited
      if (input.excludeExpenseId && expense.id === input.excludeExpenseId)
        return false

      // Amount is mandatory
      if (expense.amount !== input.amount) return false

      // At least one reinforcement factor must also match
      return hasReinforcementFactor(input, expense)
    })
    .map((expense) => ({
      id: expense.id,
      title: expense.title,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      categoryId: expense.categoryId,
      isDateProximate: isDateProximate(input.expenseDate, expense.expenseDate),
    }))

  return {
    hasDuplicates: matches.length > 0,
    matches,
  }
}

/**
 * Computes which similarity indicators apply between a new expense and an
 * existing matched expense.
 *
 * Returns an array of indicators describing which fields match:
 * - 'similar-title': normalized titles are equal
 * - 'same-amount': amounts are strictly equal
 * - 'close-in-date': the existing expense's date is within the proximity window
 * - 'same-category': categoryIds are equal and non-zero (not uncategorized)
 */
export function computeSimilarityIndicators(
  newExpense: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
  },
  existingExpense: {
    title: string
    amount: number
    expenseDate: Date
    categoryId?: number
    isDateProximate: boolean
  },
): SimilarityIndicator[] {
  const indicators: SimilarityIndicator[] = []

  if (
    normalizeExpenseTitle(newExpense.title) ===
    normalizeExpenseTitle(existingExpense.title)
  ) {
    indicators.push('similar-title')
  }

  if (newExpense.amount === existingExpense.amount) {
    indicators.push('same-amount')
  }

  if (existingExpense.isDateProximate) {
    indicators.push('close-in-date')
  }

  if (
    newExpense.categoryId != null &&
    existingExpense.categoryId != null &&
    newExpense.categoryId === existingExpense.categoryId &&
    newExpense.categoryId !== 0
  ) {
    indicators.push('same-category')
  }

  return indicators
}
