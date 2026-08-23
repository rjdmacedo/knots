/**
 * Property-based tests for subscription-filters.ts
 *
 * Feature: unified-group-notifications, Property 11: isActivityTypeEnabled identity
 *
 * Validates: Requirements 10.5
 */

import { ActivityType } from '@prisma/client'
import fc from 'fast-check'
import { isActivityTypeEnabled } from '../subscription-filters'

// Feature: unified-group-notifications, Property 11: isActivityTypeEnabled identity
describe('Property 11: isActivityTypeEnabled identity', () => {
  /**
   * Validates: Requirements 10.5
   *
   * For any ActivityType in the defined mapping (CREATE_EXPENSE, UPDATE_EXPENSE,
   * UPDATE_GROUP, DELETE_EXPENSE) and for any preferences object with boolean event
   * flags, isActivityTypeEnabled(activityType, prefs) SHALL return exactly the value
   * of the corresponding named flag:
   *   - CREATE_EXPENSE  → prefs.notifyOnCreate
   *   - UPDATE_EXPENSE  → prefs.notifyOnUpdate
   *   - UPDATE_GROUP    → prefs.notifyOnUpdate
   *   - DELETE_EXPENSE  → prefs.notifyOnDelete
   */
  it('returns the exact flag value dictated by the ActivityType mapping', () => {
    const arbActivityType = fc.constantFrom(
      ActivityType.CREATE_EXPENSE,
      ActivityType.UPDATE_EXPENSE,
      ActivityType.UPDATE_GROUP,
      ActivityType.DELETE_EXPENSE,
    )

    const arbPrefs = fc.record({
      notifyOnCreate: fc.boolean(),
      notifyOnUpdate: fc.boolean(),
      notifyOnDelete: fc.boolean(),
    })

    fc.assert(
      fc.property(arbActivityType, arbPrefs, (activityType, prefs) => {
        const result = isActivityTypeEnabled(activityType, prefs)

        switch (activityType) {
          case ActivityType.CREATE_EXPENSE:
            expect(result).toBe(prefs.notifyOnCreate)
            break
          case ActivityType.UPDATE_EXPENSE:
          case ActivityType.UPDATE_GROUP:
            expect(result).toBe(prefs.notifyOnUpdate)
            break
          case ActivityType.DELETE_EXPENSE:
            expect(result).toBe(prefs.notifyOnDelete)
            break
        }
      }),
      { numRuns: 100 },
    )
  })
})
