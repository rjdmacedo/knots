import { Currency } from '@/lib/currency'
import { formatCurrency, formatDate } from '@/lib/utils'
import fc from 'fast-check'
import { formatFieldValue, getFieldLabel } from '../format-change-value'

/**
 * Property-based tests for formatFieldValue and getFieldLabel.
 *
 * Feature: activity-changes-ui
 * Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.3
 */

const KNOWN_FIELDS = [
  'title',
  'amount',
  'expenseDate',
  'category',
  'paidBy',
  'splitMode',
  'isReimbursement',
  'notes',
  'recurrenceRule',
  'paidFor',
  'name',
  'information',
  'currency',
  'participants',
] as const

// A mock translation function that returns a predictable value
const mockT = (key: string) => `translated:${key}`

// A currency fixture for testing
const testCurrency: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

const testLocale = 'en-US'

// Arbitrary for generating field names that are NOT in the known fields set
const unknownFieldArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !(KNOWN_FIELDS as readonly string[]).includes(s))

// Arbitrary for participant entries
const participantArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }),
})

// Arbitrary for category entries
const categoryArb = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  grouping: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
})

// Arbitrary for valid integer amounts (minor units)
const amountArb = fc.integer({ min: 0, max: 100_000_000 })

// Arbitrary for valid ISO date strings
const dateArb = fc
  .date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString())

// Arbitrary for boolean string values
const booleanStringArb = fc.constantFrom('true', 'false')

describe('getFieldLabel - Property-Based Tests', () => {
  /**
   * Property 3: Unknown field names display as-is
   *
   * For any field name string that is not in the set of known field mappings,
   * the getFieldLabel function SHALL return that string unmodified.
   *
   * **Validates: Requirements 2.3**
   */
  it('Property 3: Unknown field names display as-is', () => {
    fc.assert(
      fc.property(unknownFieldArb, (field) => {
        const result = getFieldLabel(field, mockT)
        expect(result).toBe(field)
      }),
      { numRuns: 100 },
    )
  })

  it('Known field names are translated via the t function', () => {
    for (const field of KNOWN_FIELDS) {
      const result = getFieldLabel(field, mockT)
      expect(result).toBe(`translated:fieldLabels.${field}`)
    }
  })
})

describe('formatFieldValue - Property-Based Tests', () => {
  /**
   * Property 4: Value formatting correctness by field type
   *
   * For any valid field-value pair, the formatFieldValue function SHALL produce
   * the correctly formatted output: amounts as currency strings, dates as localized
   * date strings, participant IDs as resolved names, category IDs as resolved
   * category names, booleans as localized Yes/No labels, and all other fields as
   * the raw string value unchanged.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.3**
   */

  it('Property 4a: amount field formats as currency', () => {
    fc.assert(
      fc.property(amountArb, (amount) => {
        const value = String(amount)
        const result = formatFieldValue('amount', value, {
          currency: testCurrency,
          locale: testLocale,
          participants: [],
          categories: [],
          t: mockT,
        })

        const expected = formatCurrency(testCurrency, amount, testLocale)
        expect(result).toBe(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('Property 4b: expenseDate field formats as localized date', () => {
    fc.assert(
      fc.property(dateArb, (isoString) => {
        const result = formatFieldValue('expenseDate', isoString, {
          currency: testCurrency,
          locale: testLocale,
          participants: [],
          categories: [],
          t: mockT,
        })

        const expected = formatDate(new Date(isoString), testLocale, {
          dateStyle: 'medium',
        })
        expect(result).toBe(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('Property 4c: isReimbursement field formats as localized boolean', () => {
    fc.assert(
      fc.property(booleanStringArb, (boolStr) => {
        const result = formatFieldValue('isReimbursement', boolStr, {
          currency: testCurrency,
          locale: testLocale,
          participants: [],
          categories: [],
          t: mockT,
        })

        const expected = boolStr === 'true' ? mockT('yes') : mockT('no')
        expect(result).toBe(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('Property 4d: paidBy field resolves participant ID to name', () => {
    fc.assert(
      fc.property(
        fc.array(participantArb, { minLength: 1, maxLength: 10 }),
        (participants) => {
          // Pick a random participant from the list
          const target = participants[0]
          const result = formatFieldValue('paidBy', target.id, {
            currency: testCurrency,
            locale: testLocale,
            participants,
            categories: [],
            t: mockT,
          })

          expect(result).toBe(target.name)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 4e: paidFor field resolves JSON array of IDs to participant names', () => {
    fc.assert(
      fc.property(
        fc.array(participantArb, { minLength: 1, maxLength: 5 }),
        (participants) => {
          // Use all participant IDs as the paidFor value
          const ids = participants.map((p) => p.id)
          const value = JSON.stringify(ids)

          const result = formatFieldValue('paidFor', value, {
            currency: testCurrency,
            locale: testLocale,
            participants,
            categories: [],
            t: mockT,
          })

          const expected = participants.map((p) => p.name).join(', ')
          expect(result).toBe(expected)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 4f: category field resolves ID to grouping/name', () => {
    fc.assert(
      fc.property(
        fc.array(categoryArb, { minLength: 1, maxLength: 10 }),
        (categories) => {
          const target = categories[0]
          const value = String(target.id)

          const result = formatFieldValue('category', value, {
            currency: testCurrency,
            locale: testLocale,
            participants: [],
            categories,
            t: mockT,
          })

          expect(result).toBe(`${target.grouping}/${target.name}`)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 4g: unknown fields return raw value unchanged', () => {
    fc.assert(
      fc.property(
        unknownFieldArb,
        fc.string({ minLength: 0, maxLength: 50 }),
        (field, value) => {
          const result = formatFieldValue(field, value, {
            currency: testCurrency,
            locale: testLocale,
            participants: [],
            categories: [],
            t: mockT,
          })

          expect(result).toBe(value)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 4h: null value always returns null regardless of field', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 30 }), (field) => {
        const result = formatFieldValue(field, null, {
          currency: testCurrency,
          locale: testLocale,
          participants: [],
          categories: [],
          t: mockT,
        })

        expect(result).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
