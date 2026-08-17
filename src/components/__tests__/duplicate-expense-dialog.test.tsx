import type { Currency } from '@/lib/currency'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { DuplicateExpenseDialog } from '../duplicate-expense-dialog'

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: 'Potential duplicate detected',
      description:
        'The expense you are saving looks similar to an existing one. Compare below and decide whether to continue.',
      cancel: 'Cancel',
      confirm: 'Save anyway',
      yours: 'Yours',
      existing: 'Existing',
      'fields.title': 'Title',
      'fields.amount': 'Amount',
      'fields.date': 'Date',
      'indicators.similar-title': 'Similar title',
      'indicators.same-amount': 'Same amount',
      'indicators.close-in-date': 'Close in date',
      'indicators.same-category': 'Same category',
    }
    return messages[key] ?? key
  },
}))

const usdCurrency: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

const defaultMatches = [
  {
    id: 'exp-1',
    title: 'Dinner at Restaurant',
    amount: 2500, // $25.00 in minor units
    expenseDate: new Date('2024-06-15'),
    categoryId: 3,
    isDateProximate: false,
  },
]

const defaultNewExpense = {
  title: 'Dinner at Restaurant',
  amount: 2500,
  expenseDate: new Date('2024-06-20'),
}

const defaultProps = {
  open: true,
  matches: defaultMatches,
  newExpense: defaultNewExpense,
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
  currency: usdCurrency,
  locale: 'en-US' as const,
}

describe('DuplicateExpenseDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * Validates: Requirement 3.2
   */
  it('renders match details including title, amount, and date', () => {
    render(<DuplicateExpenseDialog {...defaultProps} />)

    // Title appears in both "Yours" and "Existing" columns
    const titles = screen.getAllByText('Dinner at Restaurant')
    expect(titles.length).toBeGreaterThanOrEqual(1)
    // Amount formatted as currency: $25.00 (appears in both columns since amounts match)
    const amounts = screen.getAllByText(/\$25\.00/)
    expect(amounts.length).toBeGreaterThanOrEqual(1)
    // Date formatted with medium dateStyle
    const dateText = defaultMatches[0].expenseDate.toLocaleString('en-US', {
      dateStyle: 'medium',
    })
    expect(screen.getByText(new RegExp(dateText))).toBeInTheDocument()
  })

  /**
   * Validates: Requirement 3.2
   */
  it('renders multiple matches', () => {
    const matches = [
      {
        id: 'exp-1',
        title: 'Groceries',
        amount: 5000,
        expenseDate: new Date('2024-06-10'),
        categoryId: 3,
        isDateProximate: false,
      },
      {
        id: 'exp-2',
        title: 'Groceries',
        amount: 5000,
        expenseDate: new Date('2024-06-12'),
        categoryId: 3,
        isDateProximate: true,
      },
    ]

    const newExpense = {
      title: 'Groceries',
      amount: 5000,
      expenseDate: new Date('2024-06-11'),
    }

    render(
      <DuplicateExpenseDialog
        {...defaultProps}
        matches={matches}
        newExpense={newExpense}
      />,
    )

    const items = screen.getAllByText('Groceries')
    // Each match renders a comparison table with "Yours" and "Existing" columns
    // 2 matches × 2 columns = at least 4 occurrences of "Groceries"
    expect(items.length).toBeGreaterThanOrEqual(4)
  })

  /**
   * Validates: Requirement 3.3
   */
  it('"Confirm" button calls onConfirm', () => {
    const onConfirm = jest.fn()
    render(<DuplicateExpenseDialog {...defaultProps} onConfirm={onConfirm} />)

    const confirmButton = screen.getByRole('button', { name: /save anyway/i })
    fireEvent.click(confirmButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  /**
   * Validates: Requirement 3.4
   */
  it('"Cancel" button calls onCancel', () => {
    const onCancel = jest.fn()
    render(<DuplicateExpenseDialog {...defaultProps} onCancel={onCancel} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    expect(onCancel).toHaveBeenCalled()
  })

  /**
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
   */
  it('renders similarity indicator badges for matching fields', () => {
    const matches = [
      {
        id: 'exp-1',
        title: 'Coffee',
        amount: 500,
        expenseDate: new Date('2024-06-15'),
        categoryId: 3,
        isDateProximate: true,
      },
    ]

    const newExpense = {
      title: 'Coffee',
      amount: 500,
      expenseDate: new Date('2024-06-16'),
    }

    render(
      <DuplicateExpenseDialog
        {...defaultProps}
        matches={matches}
        newExpense={newExpense}
      />,
    )

    expect(screen.getByText('Similar title')).toBeInTheDocument()
    expect(screen.getByText('Same amount')).toBeInTheDocument()
    expect(screen.getByText('Close in date')).toBeInTheDocument()
  })

  /**
   * Validates: Requirement 7.4
   */
  it('does not show "Close in date" badge when isDateProximate is false', () => {
    const matches = [
      {
        id: 'exp-1',
        title: 'Coffee',
        amount: 500,
        expenseDate: new Date('2024-06-15'),
        categoryId: 3,
        isDateProximate: false,
      },
    ]

    const newExpense = {
      title: 'Coffee',
      amount: 500,
      expenseDate: new Date('2024-08-01'),
    }

    render(
      <DuplicateExpenseDialog
        {...defaultProps}
        matches={matches}
        newExpense={newExpense}
      />,
    )

    expect(screen.getByText('Similar title')).toBeInTheDocument()
    expect(screen.getByText('Same amount')).toBeInTheDocument()
    expect(screen.queryByText('Close in date')).not.toBeInTheDocument()
  })

  /**
   * Validates: Requirement 7.6
   */
  it('renders dialog even when no individual indicators apply', () => {
    const matches = [
      {
        id: 'exp-1',
        title: 'Groceries',
        amount: 3000,
        expenseDate: new Date('2024-06-15'),
        categoryId: 3,
        isDateProximate: false,
      },
    ]

    // New expense with different title, different amount, not date proximate
    const newExpense = {
      title: 'Different Title',
      amount: 9999,
      expenseDate: new Date('2024-12-01'),
    }

    render(
      <DuplicateExpenseDialog
        {...defaultProps}
        matches={matches}
        newExpense={newExpense}
      />,
    )

    // Dialog still renders
    expect(screen.getByText('Potential duplicate detected')).toBeInTheDocument()
    // Match details still shown
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    // No badge indicators should be present
    expect(screen.queryByText('Similar title')).not.toBeInTheDocument()
    expect(screen.queryByText('Same amount')).not.toBeInTheDocument()
    expect(screen.queryByText('Close in date')).not.toBeInTheDocument()
  })

  it('does not render dialog content when open is false', () => {
    render(<DuplicateExpenseDialog {...defaultProps} open={false} />)

    expect(
      screen.queryByText('Potential duplicate detected'),
    ).not.toBeInTheDocument()
  })
})
