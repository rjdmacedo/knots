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
    saveDefaultPaidByOptions: false,
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

describe('expenseFormSchema – itemization (v1.1)', () => {
  /**
   * Build a valid authoritative itemized input. Mirrors what the form submits:
   * paidFor holds the computed per-participant BY_AMOUNT shares (items 4000 +
   * remainder 600 = amount 4600), and the itemization object carries the raw
   * items + the "Other" remainder.
   */
  function itemizedInput(
    itemizationOverrides: Record<string, unknown> = {},
    rest: Record<string, unknown> = {},
  ) {
    return {
      expenseDate: new Date('2024-06-01'),
      title: 'Dinner',
      category: 0,
      amount: 4600,
      paidBy: [{ participant: 'user-1', amount: 4600 }],
      paidFor: [
        { participant: 'user-1', shares: 3300 },
        { participant: 'user-2', shares: 1300 },
      ],
      splitMode: 'BY_AMOUNT',
      saveDefaultSplittingOptions: false,
      saveDefaultPaidByOptions: false,
      isReimbursement: false,
      itemization: {
        authoritative: true,
        items: [
          { title: 'Burger', amount: 3000, assignedParticipants: ['user-1'] },
          { title: 'Salad', amount: 1000, assignedParticipants: ['user-2'] },
        ],
        remainder: { amount: 600, allocationMode: 'PROPORTIONAL' },
        ...itemizationOverrides,
      },
      ...rest,
    }
  }

  it('accepts a valid authoritative itemized expense and forces splitMode to BY_AMOUNT', () => {
    const result = expenseFormSchema.safeParse(itemizedInput())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.splitMode).toBe('BY_AMOUNT')
    }
  })

  it('rejects an authoritative itemized expense with no items', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        items: [],
        remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemsRequired',
      )
    }
  })

  it('rejects an item assigned to no participant', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        items: [{ title: 'Burger', amount: 4600, assignedParticipants: [] }],
        remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemNeedsAssignment',
      )
    }
  })

  it('rejects an item assigned to a participant not in paidFor', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        items: [
          {
            title: 'Burger',
            amount: 4600,
            assignedParticipants: ['ghost-user'],
          },
        ],
        remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemAssignmentUnknownParticipant',
      )
    }
  })

  it('rejects a negative item amount', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        items: [
          { title: 'Burger', amount: -100, assignedParticipants: ['user-1'] },
        ],
        remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemAmountNonNegative',
      )
    }
  })

  it('rejects when items overshoot the expense total', () => {
    // Items sum 5000 but amount is 4600 → overshoot.
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        items: [
          { title: 'Burger', amount: 4000, assignedParticipants: ['user-1'] },
          { title: 'Salad', amount: 1000, assignedParticipants: ['user-2'] },
        ],
        remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemsExceedAmount',
      )
    }
  })

  it('rejects a CUSTOM remainder row for someone not in paidFor', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        remainder: {
          amount: 600,
          allocationMode: 'CUSTOM',
          splitMode: 'EVENLY',
          paidFor: [{ participant: 'ghost-user', shares: 1 }],
        },
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'remainderShareUnknownParticipant',
      )
    }
  })

  it('accepts a valid CUSTOM remainder over current participants', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({
        remainder: {
          amount: 600,
          allocationMode: 'CUSTOM',
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
          ],
        },
      }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects authoritative itemization on a reimbursement', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({}, { isReimbursement: true, title: '', category: 1 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemizationNotAllowedHere',
      )
    }
  })

  it('rejects authoritative itemization on a recurring expense', () => {
    const result = expenseFormSchema.safeParse(
      itemizedInput({}, { recurrenceRule: 'MONTHLY' }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemizationNotAllowedHere',
      )
    }
  })

  it('documentation items (authoritative=false) do not drive the split', () => {
    // Legacy EVENLY split with documentation items present. The split stays
    // EVENLY and the items are not validated as an authoritative split.
    const result = expenseFormSchema.safeParse(
      itemizedInput(
        { authoritative: false },
        {
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
          ],
        },
      ),
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.splitMode).toBe('EVENLY')
    }
  })

  it('documentation items are exempt from the overshoot / assignment rules', () => {
    // Unassigned items + items over total would fail if authoritative, but as
    // documentation they are allowed.
    const result = expenseFormSchema.safeParse(
      itemizedInput(
        {
          authoritative: false,
          items: [{ title: 'Big', amount: 9999, assignedParticipants: [] }],
          remainder: { amount: 0, allocationMode: 'PROPORTIONAL' },
        },
        {
          splitMode: 'EVENLY',
          paidFor: [
            { participant: 'user-1', shares: 1 },
            { participant: 'user-2', shares: 1 },
          ],
        },
      ),
    )
    // The item's own field-level min(1) assignment rule still applies, so an
    // unassigned item is rejected even as documentation.
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'itemNeedsAssignment',
      )
    }
  })

  it('accepts authoritative FX itemization where paidFor sums to originalAmount, not amount', () => {
    // FX bugfix (Requirement 18): the editor computes paidFor in the entry
    // currency, so shares sum to originalAmount (Entry_Total), while `amount` is
    // the converted group total. The legacy BY_AMOUNT sum-to-amount check must
    // NOT fire for authoritative itemization — the server re-derives shares.
    const result = expenseFormSchema.safeParse(
      itemizedInput(
        {},
        {
          // Group-currency amount differs from the entry-currency item shares.
          amount: 5060, // 4600 EUR * 1.1
          originalAmount: 4600,
          originalCurrency: 'EUR',
          conversionRate: 1.1,
          // paidBy is in group currency and sums to `amount`.
          paidBy: [{ participant: 'user-1', amount: 5060 }],
          // paidFor (entry-currency shares from the editor) sums to originalAmount.
          paidFor: [
            { participant: 'user-1', shares: 3300 },
            { participant: 'user-2', shares: 1300 },
          ],
        },
      ),
    )
    expect(result.success).toBe(true)
    if (!result.success) {
      // Should not contain amountSum for the authoritative itemized case.
      expect(result.error.issues.map((i) => i.message)).not.toContain(
        'amountSum',
      )
    }
  })

  it('leaves non-itemized expenses unchanged (no itemization field)', () => {
    const result = expenseFormSchema.safeParse(
      validExpenseInput([{ participant: 'user-1', amount: 5000 }]),
    )
    expect(result.success).toBe(true)
  })
})
