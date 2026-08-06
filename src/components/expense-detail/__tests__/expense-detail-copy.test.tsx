import type { Currency } from '@/lib/currency'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en-US',
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  notFound: jest.fn(),
}))

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

// Mock tRPC client
jest.mock('@/trpc/client', () => ({
  trpc: {
    useUtils: () => ({}),
    groups: {
      get: { useQuery: () => ({ data: null, isLoading: false }) },
      expenses: {
        get: { useQuery: () => ({ data: null, isLoading: false }) },
        delete: {
          useMutation: () => ({ mutate: jest.fn(), isPending: false }),
        },
      },
      balances: { invalidate: jest.fn() },
    },
    categories: { list: { useQuery: () => ({ data: { categories: [] } }) } },
    profile: { getProfile: { useQuery: () => ({ data: null }) } },
    friends: {
      getDirectExpense: { useQuery: () => ({ data: null, isLoading: false }) },
      getPaymentDetail: { useQuery: () => ({ data: null, isLoading: false }) },
      deleteDirectExpense: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
      deletePayment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}))

// Mock the category picker (uses tRPC internally)
jest.mock('../expense-detail-category-picker', () => ({
  ExpenseDetailCategoryPicker: () => <div data-testid="category-picker" />,
}))

// Mock the receipt upload component
jest.mock('../expense-detail-receipt-upload', () => ({
  ExpenseDetailReceiptUpload: () => <div data-testid="receipt-upload" />,
}))

// Mock the trends component
jest.mock('../expense-detail-trends', () => ({
  ExpenseDetailTrends: () => <div data-testid="trends" />,
}))

import { ExpenseDetailContent } from '../expense-detail'

const usdCurrency: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

const baseExpense = {
  id: 'exp-1',
  title: 'Test Expense',
  amount: 2500,
  expenseDate: new Date('2024-06-15'),
  createdAt: new Date('2024-06-15'),
  isReimbursement: false,
  notes: null,
  category: null,
  paidBy: { id: 'user-1', name: 'Alice' },
  paidFor: [
    {
      userId: 'user-1',
      shares: 1250,
      user: { id: 'user-1', name: 'Alice' },
    },
    {
      userId: 'user-2',
      shares: 1250,
      user: { id: 'user-2', name: 'Bob' },
    },
  ],
  splitMode: 'BY_AMOUNT' as const,
  documents: [],
}

const baseProps = {
  expense: baseExpense,
  currency: usdCurrency,
  categories: [],
  profileId: 'user-1',
  trends: [],
  categoryName: 'General',
  backHref: '/groups/g1/expenses',
  backLabel: 'Back to expenses',
  contextBadge: 'Test Group',
  trendsContextName: 'Test Group',
  statsHref: '/groups/g1/stats',
  receiptUpload: {
    variant: 'group' as const,
    groupId: 'g1',
    expenseId: 'exp-1',
  },
  canEdit: true,
  canDelete: true,
  isDeleting: false,
  onEdit: jest.fn(),
  onDelete: jest.fn(),
}

describe('ExpenseDetailContent - Copy button', () => {
  /**
   * Validates: Requirements 1.3, 1.4
   */
  it('renders the copy button when isLocked=false and onCopy is provided', () => {
    const onCopy = jest.fn()

    render(
      <ExpenseDetailContent {...baseProps} isLocked={false} onCopy={onCopy} />,
    )

    const copyButton = screen.getByRole('button', { name: 'copy' })
    expect(copyButton).toBeInTheDocument()
  })

  /**
   * Validates: Requirements 1.3, 1.4
   */
  it('does not render the copy button when isLocked=true', () => {
    const onCopy = jest.fn()

    render(
      <ExpenseDetailContent {...baseProps} isLocked={true} onCopy={onCopy} />,
    )

    const copyButton = screen.queryByRole('button', { name: 'copy' })
    expect(copyButton).not.toBeInTheDocument()
  })
})
