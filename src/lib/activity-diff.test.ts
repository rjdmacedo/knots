import { computeExpenseChanges, computeGroupChanges } from './activity-diff'

describe('computeExpenseChanges', () => {
  const baseExpense = {
    title: 'Dinner',
    amount: 5000,
    expenseDate: new Date('2024-06-15T12:00:00.000Z'),
    categoryId: 1,
    paidById: 'participant-1',
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: [{ userId: 'participant-1' }, { userId: 'participant-2' }],
    payers: [{ userId: 'participant-1', amount: 5000 }],
  }

  const baseUpdated = {
    title: 'Dinner',
    amount: 5000,
    expenseDate: new Date('2024-06-15T12:00:00.000Z'),
    category: 1,
    paidBy: [{ participant: 'participant-1', amount: 5000 }],
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: [
      { participant: 'participant-1' },
      { participant: 'participant-2' },
    ],
  }

  describe('unchanged fields produce no FieldChange entries', () => {
    it('returns an empty array when both states are identical', () => {
      const changes = computeExpenseChanges(baseExpense, baseUpdated)
      expect(changes).toEqual([])
    })

    it('returns an empty array when notes are both undefined', () => {
      const existing = { ...baseExpense, notes: undefined }
      const updated = { ...baseUpdated, notes: undefined }
      const changes = computeExpenseChanges(existing, updated)
      expect(changes).toEqual([])
    })

    it('returns an empty array when notes are null vs undefined (both normalize to null)', () => {
      const existing = { ...baseExpense, notes: null }
      const updated = { ...baseUpdated, notes: undefined }
      const changes = computeExpenseChanges(existing, updated)
      expect(changes).toEqual([])
    })

    it('does not produce false positives for boolean fields', () => {
      // isReimbursement: false on both sides should not trigger a change
      const changes = computeExpenseChanges(
        { ...baseExpense, isReimbursement: false },
        { ...baseUpdated, isReimbursement: false },
      )
      expect(changes).toEqual([])
    })

    it('does not produce false positives for numeric zero', () => {
      const changes = computeExpenseChanges(
        { ...baseExpense, amount: 0 },
        { ...baseUpdated, amount: 0 },
      )
      expect(changes).toEqual([])
    })

    it('does not produce false positives for Date objects representing the same moment', () => {
      const date1 = new Date('2024-01-15T10:30:00.000Z')
      const date2 = new Date('2024-01-15T10:30:00.000Z')
      const changes = computeExpenseChanges(
        { ...baseExpense, expenseDate: date1 },
        { ...baseUpdated, expenseDate: date2 },
      )
      expect(changes).toEqual([])
    })

    it('does not produce false positives for paidFor with same participants in different order', () => {
      const changes = computeExpenseChanges(
        {
          ...baseExpense,
          paidFor: [{ userId: 'participant-2' }, { userId: 'participant-1' }],
        },
        {
          ...baseUpdated,
          paidFor: [
            { participant: 'participant-1' },
            { participant: 'participant-2' },
          ],
        },
      )
      expect(changes).toEqual([])
    })

    it('only produces FieldChange entries for fields that actually changed', () => {
      const changes = computeExpenseChanges(baseExpense, {
        ...baseUpdated,
        title: 'Lunch',
      })
      expect(changes).toHaveLength(1)
      expect(changes[0]).toEqual({
        field: 'title',
        oldValue: 'Dinner',
        newValue: 'Lunch',
      })
    })

    it('does not produce entries for unchanged fields when some fields change', () => {
      const changes = computeExpenseChanges(baseExpense, {
        ...baseUpdated,
        amount: 7500,
      })
      // Only amount should change, not title, category, etc.
      expect(changes).toHaveLength(1)
      expect(changes[0].field).toBe('amount')
      // Verify no other fields are present
      const changedFields = changes.map((c) => c.field)
      expect(changedFields).not.toContain('title')
      expect(changedFields).not.toContain('category')
      expect(changedFields).not.toContain('paidBy')
      expect(changedFields).not.toContain('splitMode')
      expect(changedFields).not.toContain('isReimbursement')
      expect(changedFields).not.toContain('notes')
      expect(changedFields).not.toContain('recurrenceRule')
      expect(changedFields).not.toContain('paidFor')
    })
  })
})

describe('computeExpenseChanges — paidBy changes', () => {
  const baseExpense = {
    title: 'Dinner',
    amount: 5000,
    expenseDate: new Date('2024-06-15T12:00:00.000Z'),
    categoryId: 1,
    paidById: 'participant-1',
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: [{ userId: 'participant-1' }, { userId: 'participant-2' }],
    payers: [{ userId: 'participant-1', amount: 5000 }],
  }

  const baseUpdated = {
    title: 'Dinner',
    amount: 5000,
    expenseDate: new Date('2024-06-15T12:00:00.000Z'),
    category: 1,
    paidBy: [{ participant: 'participant-1', amount: 5000 }],
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: [
      { participant: 'participant-1' },
      { participant: 'participant-2' },
    ],
  }

  it('generates a paidBy change when a second payer is added', () => {
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 3000 },
        { participant: 'participant-2', amount: 2000 },
      ],
    }
    const changes = computeExpenseChanges(baseExpense, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeDefined()
    expect(paidByChange!.oldValue).toBe(
      JSON.stringify([{ userId: 'participant-1', amount: 5000 }]),
    )
    expect(paidByChange!.newValue).toBe(
      JSON.stringify([
        { userId: 'participant-1', amount: 3000 },
        { userId: 'participant-2', amount: 2000 },
      ]),
    )
  })

  it('generates a paidBy change when payer amounts change', () => {
    const existing = {
      ...baseExpense,
      payers: [
        { userId: 'participant-1', amount: 3000 },
        { userId: 'participant-2', amount: 2000 },
      ],
    }
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 4000 },
        { participant: 'participant-2', amount: 1000 },
      ],
    }
    const changes = computeExpenseChanges(existing, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeDefined()
    expect(paidByChange!.oldValue).toBe(
      JSON.stringify([
        { userId: 'participant-1', amount: 3000 },
        { userId: 'participant-2', amount: 2000 },
      ]),
    )
    expect(paidByChange!.newValue).toBe(
      JSON.stringify([
        { userId: 'participant-1', amount: 4000 },
        { userId: 'participant-2', amount: 1000 },
      ]),
    )
  })

  it('does not generate a paidBy change when payers and amounts are identical', () => {
    const existing = {
      ...baseExpense,
      payers: [
        { userId: 'participant-1', amount: 3000 },
        { userId: 'participant-2', amount: 2000 },
      ],
    }
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 3000 },
        { participant: 'participant-2', amount: 2000 },
      ],
    }
    const changes = computeExpenseChanges(existing, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeUndefined()
  })

  it('does not generate a paidBy change when payers are identical but in different order', () => {
    const existing = {
      ...baseExpense,
      payers: [
        { userId: 'participant-2', amount: 2000 },
        { userId: 'participant-1', amount: 3000 },
      ],
    }
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 3000 },
        { participant: 'participant-2', amount: 2000 },
      ],
    }
    const changes = computeExpenseChanges(existing, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeUndefined()
  })

  it('records initial payer set on creation (fallback from paidById when no payers array)', () => {
    const existing = {
      ...baseExpense,
      payers: undefined as unknown as Array<{
        userId: string
        amount: number
      }>,
    }
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 3000 },
        { participant: 'participant-2', amount: 2000 },
      ],
    }
    const changes = computeExpenseChanges(existing, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeDefined()
    // Fallback: old state derived from paidById + full amount
    expect(paidByChange!.oldValue).toBe(
      JSON.stringify([{ userId: 'participant-1', amount: 5000 }]),
    )
    expect(paidByChange!.newValue).toBe(
      JSON.stringify([
        { userId: 'participant-1', amount: 3000 },
        { userId: 'participant-2', amount: 2000 },
      ]),
    )
  })

  it('records initial payer set on creation (empty payers array falls back to paidById)', () => {
    const existing = {
      ...baseExpense,
      payers: [] as Array<{ userId: string; amount: number }>,
    }
    const updated = {
      ...baseUpdated,
      paidBy: [
        { participant: 'participant-1', amount: 3000 },
        { participant: 'participant-2', amount: 2000 },
      ],
    }
    const changes = computeExpenseChanges(existing, updated)
    const paidByChange = changes.find((c) => c.field === 'paidBy')
    expect(paidByChange).toBeDefined()
    // Fallback: old state derived from paidById + full amount
    expect(paidByChange!.oldValue).toBe(
      JSON.stringify([{ userId: 'participant-1', amount: 5000 }]),
    )
  })
})

describe('computeGroupChanges', () => {
  const baseGroup = {
    name: 'Trip',
    information: null,
    currency: 'USD',
  }

  const baseUpdated = {
    name: 'Trip',
    information: undefined,
    currency: 'USD',
  }

  describe('unchanged group fields produce no FieldChange entries', () => {
    it('returns an empty array when all fields are identical', () => {
      const changes = computeGroupChanges(baseGroup, baseUpdated)
      expect(changes).toEqual([])
    })

    it('produces no entry when name is unchanged', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        currency: 'EUR', // change something else
      })
      const nameChange = changes.find((c) => c.field === 'name')
      expect(nameChange).toBeUndefined()
    })

    it('produces no entry when information is unchanged (both null/undefined)', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, information: null },
        { ...baseUpdated, information: undefined },
      )
      expect(changes.find((c) => c.field === 'information')).toBeUndefined()
    })

    it('produces no entry when information is unchanged (both empty string)', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, information: '' },
        { ...baseUpdated, information: '' },
      )
      expect(changes.find((c) => c.field === 'information')).toBeUndefined()
    })

    it('produces no entry when currency is unchanged', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        name: 'Vacation', // change something else
      })
      const currencyChange = changes.find((c) => c.field === 'currency')
      expect(currencyChange).toBeUndefined()
    })

    it('only produces entries for fields that actually changed', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        name: 'Vacation',
      })
      expect(changes).toHaveLength(1)
      expect(changes[0].field).toBe('name')
      // Verify no other fields are present
      const changedFields = changes.map((c) => c.field)
      expect(changedFields).not.toContain('information')
      expect(changedFields).not.toContain('currency')
    })
  })

  describe('name changes', () => {
    it('detects a name change and returns correct old/new values', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        name: 'Vacation',
      })
      const nameChange = changes.find((c) => c.field === 'name')
      expect(nameChange).toBeDefined()
      expect(nameChange!.oldValue).toBe('Trip')
      expect(nameChange!.newValue).toBe('Vacation')
    })

    it('detects a name change to an empty string', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        name: '',
      })
      const nameChange = changes.find((c) => c.field === 'name')
      expect(nameChange).toBeDefined()
      expect(nameChange!.oldValue).toBe('Trip')
      expect(nameChange!.newValue).toBe('')
    })
  })

  describe('currency changes', () => {
    it('detects a currency change and returns correct old/new values', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        currency: 'EUR',
      })
      const currencyChange = changes.find((c) => c.field === 'currency')
      expect(currencyChange).toBeDefined()
      expect(currencyChange!.oldValue).toBe('USD')
      expect(currencyChange!.newValue).toBe('EUR')
    })

    it('detects a currency change between non-USD currencies', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, currency: 'GBP' },
        { ...baseUpdated, currency: 'JPY' },
      )
      const currencyChange = changes.find((c) => c.field === 'currency')
      expect(currencyChange).toBeDefined()
      expect(currencyChange!.oldValue).toBe('GBP')
      expect(currencyChange!.newValue).toBe('JPY')
    })
  })

  describe('identical inputs return empty array', () => {
    it('returns empty array when existing and updated are fully identical', () => {
      const changes = computeGroupChanges(baseGroup, baseUpdated)
      expect(changes).toEqual([])
      expect(changes).toHaveLength(0)
    })

    it('returns empty array when information is null vs undefined (both normalize to empty)', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, information: null },
        { ...baseUpdated, information: undefined },
      )
      expect(changes).toEqual([])
    })
  })
})
