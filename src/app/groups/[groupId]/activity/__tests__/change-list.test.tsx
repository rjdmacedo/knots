import { Currency } from '@/lib/currency'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import { ChangeList } from '../change-list'

/**
 * Property-based tests for ChangeList filtering and collapsing logic.
 *
 * Feature: activity-changes-ui
 * Validates: Requirements 1.3, 1.6, 2.4, 4.1, 4.2, 4.6, 7.3
 */

// Mock next-intl
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'fieldChangesCount') return `${params?.count} field changes`
    if (key === 'showMoreChanges') return `Show ${params?.count} more changes`
    if (key === 'showLess') return 'Show less'
    if (key === 'yes') return 'Yes'
    if (key === 'no') return 'No'
    if (key.startsWith('fieldLabels.')) return key.replace('fieldLabels.', '')
    return key
  },
  useLocale: () => 'en-US',
}))

const testCurrency: Currency = {
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  code: 'USD',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

const testParticipants = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
]

const testCategories = [
  { id: 1, grouping: 'Food', name: 'Groceries' },
  { id: 2, grouping: 'Transport', name: 'Gas' },
]

// Arbitrary for generating a valid FieldChange (at least one non-null value)
const validFieldChangeArb = fc
  .record({
    field: fc.constantFrom(
      'title',
      'amount',
      'notes',
      'splitMode',
      'currency',
      'name',
      'information',
    ),
    oldValue: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
    newValue: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
  })
  .filter((c) => c.oldValue !== null || c.newValue !== null)

// Arbitrary for generating a both-null FieldChange
const bothNullFieldChangeArb = fc.record({
  field: fc.constantFrom('title', 'amount', 'notes', 'splitMode'),
  oldValue: fc.constant(null),
  newValue: fc.constant(null),
})

// Arbitrary for generating arrays of valid changes with a specific size range
function validChangesArb(min: number, max: number) {
  return fc.array(validFieldChangeArb, { minLength: min, maxLength: max })
}

describe('ChangeList - Property-Based Tests', () => {
  /**
   * Property 1: Change rendering preserves order and structure
   *
   * For any array of FieldChange records (with at least one non-both-null entry),
   * the rendered ChangeList SHALL display items in the same order as the input array.
   *
   * **Validates: Requirements 1.3, 2.4**
   */
  it('Property 1: Change rendering preserves order and structure', () => {
    fc.assert(
      fc.property(validChangesArb(1, 3), (changes) => {
        const { container } = render(
          <ChangeList
            changes={changes}
            groupCurrency={testCurrency}
            participants={testParticipants}
            categories={testCategories}
          />,
        )

        const listItems = container.querySelectorAll('li')
        expect(listItems.length).toBe(changes.length)

        // Verify each item contains the field label in order
        changes.forEach((change, index) => {
          const itemText = listItems[index].textContent || ''
          // The field label should appear at the start of the item text
          // For simple fields (not amount/date/etc), the label is the field name itself
          expect(itemText).toContain(change.field)
        })
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property 2: Both-null changes are filtered from output
   *
   * For any array of FieldChange records, the number of rendered list items SHALL
   * equal the number of input records where at least one of oldValue or newValue is non-null.
   *
   * **Validates: Requirements 1.6**
   */
  it('Property 2: Both-null changes are filtered from output', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(validFieldChangeArb, bothNullFieldChangeArb), {
          minLength: 1,
          maxLength: 10,
        }),
        (changes) => {
          const expectedCount = changes.filter(
            (c) => c.oldValue !== null || c.newValue !== null,
          ).length

          if (expectedCount === 0) {
            const { container } = render(
              <ChangeList
                changes={changes}
                groupCurrency={testCurrency}
                participants={testParticipants}
                categories={testCategories}
              />,
            )
            // Should render nothing
            expect(container.querySelector('ul')).toBeNull()
            return
          }

          const { container } = render(
            <ChangeList
              changes={changes}
              groupCurrency={testCurrency}
              participants={testParticipants}
              categories={testCategories}
            />,
          )

          const listItems = container.querySelectorAll('li')
          // When collapsed (> 3 valid items), only 3 are shown
          const visibleCount = expectedCount > 3 ? 3 : expectedCount
          expect(listItems.length).toBe(visibleCount)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property 5: Collapse behavior for lists exceeding threshold
   *
   * For any array of N valid FieldChange records where N > 3, the ChangeList in its
   * default (collapsed) state SHALL render exactly 3 visible items, and the toggle
   * control text SHALL indicate (N - 3) hidden changes.
   *
   * **Validates: Requirements 4.1, 4.2**
   */
  it('Property 5: Collapse behavior for lists exceeding threshold', () => {
    fc.assert(
      fc.property(validChangesArb(4, 15), (changes) => {
        const { container } = render(
          <ChangeList
            changes={changes}
            groupCurrency={testCurrency}
            participants={testParticipants}
            categories={testCategories}
          />,
        )

        // Should render exactly 3 visible items
        const listItems = container.querySelectorAll('li')
        expect(listItems.length).toBe(3)

        // Should show toggle with correct hidden count
        const hiddenCount = changes.length - 3
        const toggle = container.querySelector('button')
        expect(toggle).not.toBeNull()
        expect(toggle!.textContent).toBe(`Show ${hiddenCount} more changes`)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property 6: No toggle for lists at or below threshold
   *
   * For any array of N valid FieldChange records where 1 ≤ N ≤ 3, the ChangeList
   * SHALL render all N items and SHALL NOT render a toggle control.
   *
   * **Validates: Requirements 4.6**
   */
  it('Property 6: No toggle for lists at or below threshold', () => {
    fc.assert(
      fc.property(validChangesArb(1, 3), (changes) => {
        const { container } = render(
          <ChangeList
            changes={changes}
            groupCurrency={testCurrency}
            participants={testParticipants}
            categories={testCategories}
          />,
        )

        // Should render all items
        const listItems = container.querySelectorAll('li')
        expect(listItems.length).toBe(changes.length)

        // Should NOT render a toggle button
        const toggle = container.querySelector('button')
        expect(toggle).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property 7: Accessible change count in aria-label
   *
   * For any array of N valid FieldChange records (after filtering both-null entries),
   * the ChangeList container SHALL have an aria-label attribute containing the number N.
   *
   * **Validates: Requirements 7.3**
   */
  it('Property 7: Accessible change count in aria-label', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(validFieldChangeArb, bothNullFieldChangeArb), {
          minLength: 1,
          maxLength: 10,
        }),
        (changes) => {
          const validCount = changes.filter(
            (c) => c.oldValue !== null || c.newValue !== null,
          ).length

          if (validCount === 0) {
            // Component renders nothing for zero valid changes
            return
          }

          const { container } = render(
            <ChangeList
              changes={changes}
              groupCurrency={testCurrency}
              participants={testParticipants}
              categories={testCategories}
            />,
          )

          const list = container.querySelector('ul')
          expect(list).not.toBeNull()
          const ariaLabel = list!.getAttribute('aria-label')
          expect(ariaLabel).toBe(`${validCount} field changes`)
        },
      ),
      { numRuns: 100 },
    )
  })
})
