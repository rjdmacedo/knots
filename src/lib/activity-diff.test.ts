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
    paidFor: [
      { participantId: 'participant-1' },
      { participantId: 'participant-2' },
    ],
  }

  const baseUpdated = {
    title: 'Dinner',
    amount: 5000,
    expenseDate: new Date('2024-06-15T12:00:00.000Z'),
    category: 1,
    paidBy: 'participant-1',
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
          paidFor: [
            { participantId: 'participant-2' },
            { participantId: 'participant-1' },
          ],
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

describe('computeGroupChanges', () => {
  const baseGroup = {
    name: 'Trip',
    information: null,
    currency: 'USD',
    participants: [{ name: 'Alice' }, { name: 'Bob' }],
  }

  const baseUpdated = {
    name: 'Trip',
    information: undefined,
    currency: 'USD',
    participants: [{ name: 'Alice' }, { name: 'Bob' }],
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

    it('produces no entry when participants are unchanged (same order)', () => {
      const changes = computeGroupChanges(baseGroup, baseUpdated)
      expect(changes.find((c) => c.field === 'participants')).toBeUndefined()
    })

    it('produces no entry when participants are unchanged (different order)', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, participants: [{ name: 'Bob' }, { name: 'Alice' }] },
        { ...baseUpdated, participants: [{ name: 'Alice' }, { name: 'Bob' }] },
      )
      expect(changes.find((c) => c.field === 'participants')).toBeUndefined()
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
      expect(changedFields).not.toContain('participants')
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

    it('returns empty array when participants are in different order but same set', () => {
      const changes = computeGroupChanges(
        {
          ...baseGroup,
          participants: [
            { name: 'Charlie' },
            { name: 'Alice' },
            { name: 'Bob' },
          ],
        },
        {
          ...baseUpdated,
          participants: [
            { name: 'Bob' },
            { name: 'Charlie' },
            { name: 'Alice' },
          ],
        },
      )
      expect(changes).toEqual([])
    })
  })

  describe('participant changes serialized as comma-separated name lists', () => {
    it('serializes multiple participants as comma-separated names', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        participants: [{ name: 'Alice' }, { name: 'Charlie' }],
      })
      const participantChange = changes.find((c) => c.field === 'participants')
      expect(participantChange).toBeDefined()
      expect(participantChange!.oldValue).toBe('Alice, Bob')
      expect(participantChange!.newValue).toBe('Alice, Charlie')
    })

    it('serializes a single participant without trailing comma', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, participants: [{ name: 'Alice' }, { name: 'Bob' }] },
        { ...baseUpdated, participants: [{ name: 'Alice' }] },
      )
      const participantChange = changes.find((c) => c.field === 'participants')
      expect(participantChange).toBeDefined()
      expect(participantChange!.oldValue).toBe('Alice, Bob')
      expect(participantChange!.newValue).toBe('Alice')
    })

    it('serializes an empty participant list as an empty string', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        participants: [],
      })
      const participantChange = changes.find((c) => c.field === 'participants')
      expect(participantChange).toBeDefined()
      expect(participantChange!.oldValue).toBe('Alice, Bob')
      expect(participantChange!.newValue).toBe('')
    })

    it('sorts participant names before comparing (order-independent)', () => {
      const changes = computeGroupChanges(
        { ...baseGroup, participants: [{ name: 'Bob' }, { name: 'Alice' }] },
        { ...baseUpdated, participants: [{ name: 'Alice' }, { name: 'Bob' }] },
      )
      expect(changes.find((c) => c.field === 'participants')).toBeUndefined()
    })

    it('produces no participant change when lists are identical', () => {
      const changes = computeGroupChanges(baseGroup, baseUpdated)
      expect(changes.find((c) => c.field === 'participants')).toBeUndefined()
    })

    it('detects participant additions', () => {
      const changes = computeGroupChanges(baseGroup, {
        ...baseUpdated,
        participants: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }],
      })
      const participantChange = changes.find((c) => c.field === 'participants')
      expect(participantChange).toBeDefined()
      expect(participantChange!.oldValue).toBe('Alice, Bob')
      expect(participantChange!.newValue).toBe('Alice, Bob, Charlie')
    })
  })
})
