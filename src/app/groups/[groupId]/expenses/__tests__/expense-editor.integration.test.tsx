import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// next-intl: return the key so assertions can be made against literal keys.
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en-US',
}))

// next/navigation: capture router.push calls.
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Toast: no-op, but keep the shape the Editor uses.
jest.mock('@/components/ui/toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    add: jest.fn(() => 'toast-id'),
    close: jest.fn(),
  },
}))

// Media query hook used by the Editor.
jest.mock('@/lib/hooks', () => ({
  useMediaQuery: () => true,
}))

// Currency/format helpers pulled in transitively — keep them lightweight.
jest.mock('@/lib/invalidate-activity-queries', () => ({
  invalidateActivityQueries: jest.fn(),
}))

// The Editor decides PaymentForm vs ExpenseForm; consolidated-payment guard.
jest.mock('@/lib/payments', () => ({
  isConsolidatedPayment: () => false,
}))

// Mock the group context so the Editor sees a loaded group.
const testGroup = {
  id: 'g1',
  name: 'Test Group',
  currency: '$',
  currencyCode: 'USD',
  participants: [
    { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
    { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
  ],
}

jest.mock('@/app/groups/[groupId]/current-group-context', () => ({
  useCurrentGroup: () => ({
    isLoading: false,
    groupId: 'g1',
    group: testGroup,
  }),
}))

// Replace the outside-participant control with a marker (avoids picker wiring).
jest.mock('@/components/expense-editor/outside-participant-control', () => ({
  OutsideParticipantControl: () => (
    <div data-testid="outside-participant-control" />
  ),
}))

// Mock the forms. Each renders the loaded title/amount so we can assert the
// expense was loaded, and exposes Save/Delete buttons that call the Editor's
// handlers with a fixed set of form values.
const submittedValues = {
  title: 'Dinner',
  amount: 2500,
  category: 1,
  expenseDate: new Date('2024-06-15'),
  paidBy: [{ participant: 'user-1', shares: 2500 }],
  paidFor: [
    { participant: 'user-1', shares: 1250 },
    { participant: 'user-2', shares: 1250 },
  ],
  splitMode: 'BY_AMOUNT',
  isReimbursement: false,
  notes: '',
  documents: [],
  recurrenceRule: null,
  originalCurrency: 'USD',
}

jest.mock('@/app/groups/[groupId]/expenses/expense-form', () => ({
  ExpenseForm: ({
    expense,
    onSubmit,
    onDelete,
  }: {
    expense?: { title?: string; amount?: number }
    onSubmit: (values: unknown) => void
    onDelete?: () => void
  }) => (
    <div data-testid="expense-form">
      {expense ? (
        <>
          <span data-testid="loaded-title">{expense.title}</span>
          <span data-testid="loaded-amount">{expense.amount}</span>
        </>
      ) : null}
      <button onClick={() => onSubmit(submittedValues)}>save</button>
      {onDelete ? <button onClick={() => onDelete()}>delete</button> : null}
    </div>
  ),
}))

jest.mock('@/app/groups/[groupId]/expenses/payment-form', () => ({
  PaymentForm: ({
    onSubmit,
    onDelete,
  }: {
    onSubmit: (values: unknown) => void
    onDelete?: () => void
  }) => (
    <div data-testid="payment-form">
      <button onClick={() => onSubmit(submittedValues)}>save</button>
      {onDelete ? <button onClick={() => onDelete()}>delete</button> : null}
    </div>
  ),
}))

// tRPC client: mutations are jest.fn() so we can assert their payloads;
// queries return the loaded expense in edit mode.
const mockCreate = jest.fn().mockResolvedValue({ expense: { id: 'exp-new' } })
const mockUpdate = jest.fn().mockResolvedValue({ expense: { id: 'exp-1' } })
const mockDelete = jest.fn().mockResolvedValue({})
const mockCreateGlobal = jest.fn().mockResolvedValue({})

const editingExpense = {
  id: 'exp-1',
  title: 'Dinner',
  amount: 2500,
  isReimbursement: false,
}

jest.mock('@/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      groups: {
        expenses: { get: { invalidate: jest.fn() }, invalidate: jest.fn() },
        balances: { invalidate: jest.fn() },
      },
      friends: {
        listWithBalances: { invalidate: jest.fn() },
        getDirectExpenses: { invalidate: jest.fn() },
        getBalanceDetail: { invalidate: jest.fn() },
        getTimeline: { invalidate: jest.fn() },
      },
      groupMembership: { getUserGroups: { invalidate: jest.fn() } },
    }),
    groups: {
      get: { useQuery: () => ({ data: null, isLoading: false }) },
      expenses: {
        get: {
          useQuery: (_input: unknown, opts?: { enabled?: boolean }) => ({
            data: opts?.enabled ? { expense: editingExpense } : undefined,
          }),
        },
        create: { useMutation: () => ({ mutateAsync: mockCreate }) },
        update: { useMutation: () => ({ mutateAsync: mockUpdate }) },
        delete: { useMutation: () => ({ mutateAsync: mockDelete }) },
      },
    },
    profile: {
      getProfile: {
        useQuery: () => ({
          data: {
            id: 'user-1',
            name: 'Alice',
            email: 'alice@example.com',
            preferredCurrency: 'USD',
          },
        }),
      },
    },
    categories: { list: { useQuery: () => ({ data: { categories: [] } }) } },
    friends: {
      list: { useQuery: () => ({ data: [] }) },
      createGlobalExpense: {
        useMutation: () => ({ mutateAsync: mockCreateGlobal }),
      },
    },
  },
}))

import { ExpenseEditor } from '@/app/groups/[groupId]/expenses/expense-editor'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'

describe('ExpenseEditor integration - load and CRUD parity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('loads the identified expense into the form in edit mode (R5.3)', () => {
    render(<ExpenseEditor groupId="g1" expenseId="exp-1" />)

    expect(screen.getByTestId('loaded-title')).toHaveTextContent('Dinner')
    expect(screen.getByTestId('loaded-amount')).toHaveTextContent('2500')
  })

  it('updates via groups.expenses.update then navigates to the Detail_Page (R2.4, R5.3)', async () => {
    render(<ExpenseEditor groupId="g1" expenseId="exp-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      expenseId: 'exp-1',
      groupId: 'g1',
      expenseFormValues: submittedValues,
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        getGroupExpenseDetailPath('g1', 'exp-1'),
      )
    })
  })

  it('creates via groups.expenses.create then navigates to the group list (R2.5, R5.3)', async () => {
    render(<ExpenseEditor groupId="g1" />)

    fireEvent.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })
    expect(mockCreate).toHaveBeenCalledWith({
      groupId: 'g1',
      expenseFormValues: submittedValues,
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/groups/g1/expenses')
    })
  })

  it('deletes via groups.expenses.delete then navigates to the group list, not the Detail_Page (R2.4, R5.3)', async () => {
    render(<ExpenseEditor groupId="g1" expenseId="exp-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'delete' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledTimes(1)
    })
    expect(mockDelete).toHaveBeenCalledWith({
      expenseId: 'exp-1',
      groupId: 'g1',
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/groups/g1/expenses')
    })
    // The deleted expense's Detail_Page must NOT be a navigation target.
    expect(mockPush).not.toHaveBeenCalledWith(
      getGroupExpenseDetailPath('g1', 'exp-1'),
    )
  })
})
