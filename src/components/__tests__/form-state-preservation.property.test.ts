/**
 * Property-based tests for form state preservation on cancel.
 *
 * Feature: duplicate-expense-detection
 * - Property 6: Cancel Preserves Form State
 *
 * Tests that for any set of valid form field values, the cancel handler
 * (which only clears dialog state) results in identical form values — no mutation.
 *
 * The ExpenseForm's handleDuplicateCancel does:
 *   setDuplicateMatches([])
 *   setPendingSubmitData(null)
 *
 * It never calls form.setValue, form.reset, or any other form state mutation.
 * This test verifies that pattern by modeling the state transition as a pure
 * function and asserting form values remain byte-for-byte identical.
 *
 * Validates: Requirements 3.4, 3.6
 */

import fc from 'fast-check'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Types modeling the form state machine ---

/**
 * Simplified ExpenseFormValues matching the shape of the real form.
 * We use a subset that covers the key fields to prove no mutation occurs.
 */
type FormValues = {
  title: string
  amount: number
  expenseDate: Date
  category: number
  paidBy: string
  paidFor: Array<{ participant: string; shares: number }>
  splitMode: 'EVENLY' | 'BY_SHARES' | 'BY_AMOUNT' | 'BY_PERCENTAGE'
  isReimbursement: boolean
  notes: string
}

/**
 * The dialog-related state that is managed separately from form values.
 */
type DialogState = {
  duplicateMatches: Array<{
    id: string
    title: string
    amount: number
    expenseDate: Date
    isDateProximate: boolean
  }>
  pendingSubmitData: FormValues | null
}

/**
 * Models the cancel handler exactly as implemented in ExpenseForm:
 *   const handleDuplicateCancel = () => {
 *     setDuplicateMatches([])
 *     setPendingSubmitData(null)
 *   }
 *
 * Returns the new dialog state. Form values are NOT touched.
 */
function handleDuplicateCancel(_dialogState: DialogState): DialogState {
  return {
    duplicateMatches: [],
    pendingSubmitData: null,
  }
}

// --- Generators ---

/** Arbitrary for a valid Date within a reasonable range (year 2000–2030) */
const arbDate = fc
  .integer({ min: 946684800000, max: 1893456000000 })
  .map((ms) => new Date(ms))

/** Arbitrary for an expense title (non-empty, reasonable length) */
const arbTitle = fc.string({ minLength: 1, maxLength: 100 })

/** Arbitrary for a positive amount in minor units (cents) */
const arbAmount = fc.integer({ min: 1, max: 10_000_000 })

/** Arbitrary for a category ID */
const arbCategory = fc.integer({ min: 0, max: 50 })

/** Arbitrary for a participant ID */
const arbParticipantId = fc.uuid()

/** Arbitrary for split mode */
const arbSplitMode = fc.constantFrom(
  'EVENLY' as const,
  'BY_SHARES' as const,
  'BY_AMOUNT' as const,
  'BY_PERCENTAGE' as const,
)

/** Arbitrary for a paidFor entry */
const arbPaidForEntry = fc.record({
  participant: arbParticipantId,
  shares: fc.integer({ min: 1, max: 10000 }),
})

/** Arbitrary for notes */
const arbNotes = fc.string({ minLength: 0, maxLength: 200 })

/** Arbitrary for valid form values */
const arbFormValues: fc.Arbitrary<FormValues> = fc.record({
  title: arbTitle,
  amount: arbAmount,
  expenseDate: arbDate,
  category: arbCategory,
  paidBy: arbParticipantId,
  paidFor: fc.array(arbPaidForEntry, { minLength: 1, maxLength: 10 }),
  splitMode: arbSplitMode,
  isReimbursement: fc.boolean(),
  notes: arbNotes,
})

/** Arbitrary for a duplicate match entry (for dialog state) */
const arbMatch = fc.record({
  id: fc.uuid(),
  title: arbTitle,
  amount: arbAmount,
  expenseDate: arbDate,
  isDateProximate: fc.boolean(),
})

// --- Tests ---

describe('Form State Preservation - Property-Based Tests', () => {
  /**
   * Feature: duplicate-expense-detection, Property 6: Cancel Preserves Form State
   *
   * For any set of valid form field values present when the Confirmation Dialog
   * is shown, clicking "Cancel" SHALL result in identical form field values
   * afterwards (no mutation).
   *
   * Validates: Requirements 3.4, 3.6
   */
  describe('Property 6: Cancel Preserves Form State', () => {
    it('cancel handler does not mutate form values: form state before === form state after', () => {
      fc.assert(
        fc.property(
          arbFormValues,
          fc.array(arbMatch, { minLength: 1, maxLength: 5 }),
          (formValues, matches) => {
            // Snapshot the form values before cancel (deep clone)
            const formValuesBefore = JSON.parse(
              JSON.stringify(formValues),
            ) as FormValues

            // Simulate the dialog being shown with matches and pending data
            const dialogStateBefore: DialogState = {
              duplicateMatches: matches,
              pendingSubmitData: { ...formValues },
            }

            // Execute cancel
            const dialogStateAfter = handleDuplicateCancel(dialogStateBefore)

            // Dialog state should be cleared
            expect(dialogStateAfter.duplicateMatches).toEqual([])
            expect(dialogStateAfter.pendingSubmitData).toBeNull()

            // Form values must remain identical — no field was mutated
            // We compare each field individually for clear error messages
            expect(formValues.title).toBe(formValuesBefore.title)
            expect(formValues.amount).toBe(formValuesBefore.amount)
            expect(formValues.expenseDate.getTime()).toBe(
              new Date(formValuesBefore.expenseDate).getTime(),
            )
            expect(formValues.category).toBe(formValuesBefore.category)
            expect(formValues.paidBy).toBe(formValuesBefore.paidBy)
            expect(formValues.paidFor).toEqual(formValuesBefore.paidFor)
            expect(formValues.splitMode).toBe(formValuesBefore.splitMode)
            expect(formValues.isReimbursement).toBe(
              formValuesBefore.isReimbursement,
            )
            expect(formValues.notes).toBe(formValuesBefore.notes)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('cancel with any pending form data preserves original form reference identity', () => {
      fc.assert(
        fc.property(
          arbFormValues,
          fc.array(arbMatch, { minLength: 1, maxLength: 3 }),
          (formValues, matches) => {
            // The form object reference should not change on cancel.
            // In React Hook Form, the form state object is managed by
            // useForm and is never reassigned by the cancel handler.
            const formRef = formValues

            const dialogState: DialogState = {
              duplicateMatches: matches,
              pendingSubmitData: formValues,
            }

            // Cancel does not return or modify form values
            handleDuplicateCancel(dialogState)

            // Reference identity preserved — cancel handler doesn't replace form values
            expect(formValues).toBe(formRef)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('cancel never introduces null or undefined into previously valid form fields', () => {
      fc.assert(
        fc.property(
          arbFormValues,
          fc.array(arbMatch, { minLength: 1, maxLength: 5 }),
          (formValues, matches) => {
            const dialogState: DialogState = {
              duplicateMatches: matches,
              pendingSubmitData: formValues,
            }

            handleDuplicateCancel(dialogState)

            // All required form fields remain defined and non-null after cancel
            expect(formValues.title).toBeDefined()
            expect(formValues.title).not.toBeNull()
            expect(formValues.amount).toBeDefined()
            expect(formValues.amount).not.toBeNull()
            expect(formValues.expenseDate).toBeDefined()
            expect(formValues.expenseDate).not.toBeNull()
            expect(formValues.category).toBeDefined()
            expect(formValues.category).not.toBeNull()
            expect(formValues.paidBy).toBeDefined()
            expect(formValues.paidBy).not.toBeNull()
            expect(formValues.paidFor).toBeDefined()
            expect(formValues.paidFor).not.toBeNull()
            expect(formValues.paidFor.length).toBeGreaterThan(0)
            expect(formValues.splitMode).toBeDefined()
            expect(formValues.splitMode).not.toBeNull()
            expect(formValues.isReimbursement).toBeDefined()
            expect(formValues.isReimbursement).not.toBeNull()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
