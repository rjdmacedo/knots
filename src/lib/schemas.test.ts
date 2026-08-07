import { expenseFormSchema } from '@/lib/schemas'

/** Minimal valid expense base input. Non-paidBy fields are held constant. */
function validExpenseInput(
  paidBy: Array<{ participant: string; amount: number }>,
  overrides: Record<string, unknown> = {},
) {
  return {
    expenseDate: new Date('2024-06-01'),
    title: 'Groceries',
    category: 0,
    amount: 5000, // 50.00 in minor units conceptually, but schema treats as raw number
    paidBy,
    paidFor: [{ participant: 'user-1', shares: 5000 }],
    splitMode: 'BY_AMOUNT',
    saveDefaultSplittingOptions: false,
    isReimbursement: false,
    ...overrides,
  }
}

describe('expenseFormSchema – paidBy validation', () => {
  it('accepts a single payer whose amount equals the total', () => {
    const input = validExpenseInput([{ participant: 'user-1', amount: 5000 }])
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts two payers whose amounts sum to the total', () => {
    const input = validExpenseInput([
      { participant: 'user-1', amount: 2000 },
      { participant: 'user-2', amount: 3000 },
    ])
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects a payer amount that is zero or negative', () => {
    const inputZero = validExpenseInput([{ participant: 'user-1', amount: 0 }])
    const resultZero = expenseFormSchema.safeParse(inputZero)
    expect(resultZero.success).toBe(false)

    const inputNeg = validExpenseInput([
      { participant: 'user-1', amount: -100 },
    ])
    const resultNeg = expenseFormSchema.safeParse(inputNeg)
    expect(resultNeg.success).toBe(false)
  })

  it('rejects payer amounts that do not sum to the total', () => {
    const input = validExpenseInput([
      { participant: 'user-1', amount: 2000 },
      { participant: 'user-2', amount: 1000 },
    ])
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('paidByAmountSum')
    }
  })

  it('rejects a reimbursement with more than one payer', () => {
    const input = validExpenseInput(
      [
        { participant: 'user-1', amount: 2500 },
        { participant: 'user-2', amount: 2500 },
      ],
      { isReimbursement: true, category: 1, title: '' },
    )
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('reimbursementSinglePayer')
    }
  })

  it('rejects an empty paidBy array', () => {
    const input = validExpenseInput([])
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const codes = result.error.issues.map((i) => i.code)
      expect(codes).toContain('too_small')
    }
  })

  it('rejects duplicate payer participants', () => {
    const input = validExpenseInput([
      { participant: 'user-1', amount: 2000 },
      { participant: 'user-1', amount: 3000 },
    ])
    const result = expenseFormSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('paidByDuplicateParticipants')
    }
  })
})
