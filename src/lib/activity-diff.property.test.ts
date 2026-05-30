import fc from 'fast-check'
import { computeExpenseChanges } from './activity-diff'

/**
 * Property-based tests for computeExpenseChanges diff completeness and soundness.
 *
 * Validates: Requirements 2.4, 2.5
 */

// Tracked scalar fields and their mapping between existing/updated shapes
const TRACKED_SCALAR_FIELDS = [
  'title',
  'amount',
  'expenseDate',
  'category',
  'paidBy',
  'splitMode',
  'isReimbursement',
  'notes',
  'recurrenceRule',
] as const

// Arbitrary for participant IDs (non-empty strings)
const participantIdArb = fc.string({ minLength: 1, maxLength: 20 })

// Arbitrary for a paidFor entry in existing shape
const existingPaidForArb = fc.array(
  participantIdArb.map((id) => ({ participantId: id })),
  { minLength: 0, maxLength: 5 },
)

// Arbitrary for a paidFor entry in updated shape
const updatedPaidForArb = fc.array(
  participantIdArb.map((id) => ({ participant: id })),
  { minLength: 0, maxLength: 5 },
)

// Arbitrary for a valid Date (noInvalidDate ensures no NaN dates are generated)
const dateArb = fc.date({
  min: new Date('2000-01-01T00:00:00.000Z'),
  max: new Date('2030-12-31T23:59:59.999Z'),
  noInvalidDate: true,
})

// Arbitrary for nullable string fields (notes, recurrenceRule)
const nullableStringArb = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 0, maxLength: 50 }),
)

// Arbitrary for an existing expense object
const existingExpenseArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  amount: fc.integer({ min: 0, max: 1_000_000 }),
  expenseDate: dateArb,
  categoryId: fc.integer({ min: 0, max: 100 }),
  paidById: participantIdArb,
  splitMode: fc.constantFrom(
    'EVENLY',
    'BY_SHARES',
    'BY_PERCENTAGE',
    'BY_AMOUNT',
  ),
  isReimbursement: fc.boolean(),
  notes: nullableStringArb,
  recurrenceRule: nullableStringArb,
  paidFor: existingPaidForArb,
})

// Arbitrary for an updated expense object
const updatedExpenseArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  amount: fc.integer({ min: 0, max: 1_000_000 }),
  expenseDate: dateArb,
  category: fc.integer({ min: 0, max: 100 }),
  paidBy: participantIdArb,
  splitMode: fc.constantFrom(
    'EVENLY',
    'BY_SHARES',
    'BY_PERCENTAGE',
    'BY_AMOUNT',
  ),
  isReimbursement: fc.boolean(),
  notes: nullableStringArb,
  recurrenceRule: nullableStringArb,
  paidFor: updatedPaidForArb,
})

/**
 * Helper: serialize a value the same way the implementation does,
 * so we can independently compute expected diffs.
 */
function serialize(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}

/**
 * Helper: compute the set of fields that genuinely differ between existing and updated,
 * using the same serialization logic as the implementation.
 */
function computeExpectedChangedFields(
  existing: {
    title: string
    amount: number
    expenseDate: Date
    categoryId: number
    paidById: string
    splitMode: string
    isReimbursement: boolean
    notes: string | null | undefined
    recurrenceRule: string | null | undefined
    paidFor: Array<{ participantId: string }>
  },
  updated: {
    title: string
    amount: number
    expenseDate: Date
    category: number
    paidBy: string
    splitMode: string
    isReimbursement: boolean
    notes: string | null | undefined
    recurrenceRule: string | null | undefined
    paidFor: Array<{ participant: string }>
  },
): Set<string> {
  const changedFields = new Set<string>()

  const fieldPairs: Array<{ field: string; oldVal: unknown; newVal: unknown }> =
    [
      { field: 'title', oldVal: existing.title, newVal: updated.title },
      { field: 'amount', oldVal: existing.amount, newVal: updated.amount },
      {
        field: 'expenseDate',
        oldVal: existing.expenseDate,
        newVal: updated.expenseDate,
      },
      {
        field: 'category',
        oldVal: existing.categoryId,
        newVal: updated.category,
      },
      { field: 'paidBy', oldVal: existing.paidById, newVal: updated.paidBy },
      {
        field: 'splitMode',
        oldVal: existing.splitMode,
        newVal: updated.splitMode,
      },
      {
        field: 'isReimbursement',
        oldVal: existing.isReimbursement,
        newVal: updated.isReimbursement,
      },
      {
        field: 'notes',
        oldVal: existing.notes || null,
        newVal: updated.notes || null,
      },
      {
        field: 'recurrenceRule',
        oldVal: existing.recurrenceRule || null,
        newVal: updated.recurrenceRule || null,
      },
    ]

  for (const { field, oldVal, newVal } of fieldPairs) {
    if (serialize(oldVal) !== serialize(newVal)) {
      changedFields.add(field)
    }
  }

  // paidFor comparison
  const oldPaidFor = existing.paidFor.map((p) => p.participantId).sort()
  const newPaidFor = updated.paidFor.map((p) => p.participant).sort()
  if (JSON.stringify(oldPaidFor) !== JSON.stringify(newPaidFor)) {
    changedFields.add('paidFor')
  }

  return changedFields
}

describe('computeExpenseChanges - Property-Based Tests', () => {
  /**
   * Property 1: Diff completeness
   * For every tracked field where oldValue !== newValue, exactly one FieldChange entry exists in the result.
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('Property 1: Diff completeness — every genuinely changed field produces exactly one FieldChange entry', () => {
    fc.assert(
      fc.property(
        existingExpenseArb,
        updatedExpenseArb,
        (existing, updated) => {
          const result = computeExpenseChanges(existing, updated)
          const expectedChangedFields = computeExpectedChangedFields(
            existing,
            updated,
          )

          // Every field that genuinely differs must appear in the result
          for (const field of Array.from(expectedChangedFields)) {
            const matchingEntries = result.filter((c) => c.field === field)
            expect(matchingEntries).toHaveLength(1)
          }

          // The total number of changes must equal the number of genuinely changed fields
          expect(result.length).toBe(expectedChangedFields.size)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * Property 2: Diff soundness
   * Every FieldChange in the result corresponds to a field where old and new values genuinely differ.
   *
   * Validates: Requirements 2.4, 2.5
   */
  it('Property 2: Diff soundness — every FieldChange in the result corresponds to a genuinely changed field', () => {
    fc.assert(
      fc.property(
        existingExpenseArb,
        updatedExpenseArb,
        (existing, updated) => {
          const result = computeExpenseChanges(existing, updated)
          const expectedChangedFields = computeExpectedChangedFields(
            existing,
            updated,
          )

          // Every entry in the result must correspond to a field that genuinely differs
          for (const change of result) {
            expect(expectedChangedFields.has(change.field)).toBe(true)
          }

          // No duplicate field entries
          const fieldNames = result.map((c) => c.field)
          const uniqueFieldNames = new Set(fieldNames)
          expect(fieldNames.length).toBe(uniqueFieldNames.size)
        },
      ),
      { numRuns: 200 },
    )
  })
})
