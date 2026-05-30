/**
 * Property-based tests for the push payload builder.
 *
 * Feature: group-push-notifications
 * - Property 9: Notification payload construction by activity type
 * - Property 14: Payload contains localization keys, not pre-rendered text
 *
 * Validates: Requirements 6.2, 6.3, 9.1
 */

import { ActivityType } from '@prisma/client'
import fc from 'fast-check'
import { buildPushPayload } from '../build-payload'

// --- Constants ---

const PBT_NUM_RUNS = 100

const EXPENSE_ACTIVITY_TYPES = [
  ActivityType.CREATE_EXPENSE,
  ActivityType.UPDATE_EXPENSE,
  ActivityType.DELETE_EXPENSE,
] as const

const EXPECTED_LOCALE_KEYS: Record<ActivityType, string> = {
  [ActivityType.CREATE_EXPENSE]: 'notifications.expenseCreated',
  [ActivityType.UPDATE_EXPENSE]: 'notifications.expenseUpdated',
  [ActivityType.DELETE_EXPENSE]: 'notifications.expenseDeleted',
  [ActivityType.UPDATE_GROUP]: 'notifications.groupUpdated',
}

// --- Generators ---

const arbGroupId = fc.string({ minLength: 1, maxLength: 50 })
const arbGroupName = fc.string({ minLength: 1, maxLength: 100 })
const arbExpenseTitle = fc.string({ minLength: 1, maxLength: 200 })
const arbActorName = fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
  nil: undefined,
})

const arbExpenseActivityType = fc.constantFrom(...EXPENSE_ACTIVITY_TYPES)

// --- Tests ---

describe('Build Payload Property Tests', () => {
  // Feature: group-push-notifications, Property 9: Notification payload construction by activity type
  describe('Property 9: Notification payload construction by activity type', () => {
    /**
     * Validates: Requirements 6.2, 6.3
     *
     * For any activity of type CREATE_EXPENSE, UPDATE_EXPENSE, or DELETE_EXPENSE,
     * the push payload SHALL contain a localeKey corresponding to the activity type
     * and params including the expense title. For any activity of type UPDATE_GROUP,
     * the payload SHALL contain a localeKey for group update and params including the group name.
     */
    it('expense activities produce correct localeKey and params including title', () => {
      fc.assert(
        fc.property(
          arbExpenseActivityType,
          arbGroupId,
          arbGroupName,
          arbExpenseTitle,
          arbActorName,
          (activityType, groupId, groupName, expenseTitle, actorName) => {
            const payload = buildPushPayload(
              activityType,
              groupId,
              groupName,
              expenseTitle,
              actorName,
            )

            // localeKey must correspond to the activity type
            expect(payload.localeKey).toBe(EXPECTED_LOCALE_KEYS[activityType])

            // params must include the expense title
            expect(payload.params).toHaveProperty('title', expenseTitle)

            // params must include the group name
            expect(payload.params).toHaveProperty('group', groupName)

            // url must point to the group's expenses page
            expect(payload.url).toBe(`/groups/${groupId}/expenses`)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('UPDATE_GROUP activity produces correct localeKey and params including group name', () => {
      fc.assert(
        fc.property(
          arbGroupId,
          arbGroupName,
          arbActorName,
          (groupId, groupName, actorName) => {
            const payload = buildPushPayload(
              ActivityType.UPDATE_GROUP,
              groupId,
              groupName,
              undefined,
              actorName,
            )

            // localeKey must be the group update key
            expect(payload.localeKey).toBe('notifications.groupUpdated')

            // params must include the group name
            expect(payload.params).toHaveProperty('group', groupName)

            // params should NOT include a title key for group updates
            expect(payload.params).not.toHaveProperty('title')

            // url must point to the group page (not expenses)
            expect(payload.url).toBe(`/groups/${groupId}`)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('localeKey always maps correctly for all activity types', () => {
      const arbAllActivityTypes = fc.constantFrom(
        ActivityType.CREATE_EXPENSE,
        ActivityType.UPDATE_EXPENSE,
        ActivityType.DELETE_EXPENSE,
        ActivityType.UPDATE_GROUP,
      )

      fc.assert(
        fc.property(
          arbAllActivityTypes,
          arbGroupId,
          arbGroupName,
          arbExpenseTitle,
          arbActorName,
          (activityType, groupId, groupName, expenseTitle, actorName) => {
            const payload = buildPushPayload(
              activityType,
              groupId,
              groupName,
              expenseTitle,
              actorName,
            )

            expect(payload.localeKey).toBe(EXPECTED_LOCALE_KEYS[activityType])
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: group-push-notifications, Property 14: Payload contains localization keys, not pre-rendered text
  describe('Property 14: Payload contains localization keys, not pre-rendered text', () => {
    /**
     * Validates: Requirements 9.1
     *
     * For any activity that triggers notification dispatch, the push payload SHALL
     * contain a `localeKey` string and a `params` object, and SHALL NOT contain
     * pre-rendered `title` or `body` text fields.
     */
    it('payload contains localeKey and params, and does not contain pre-rendered title or body fields', () => {
      const arbAllActivityTypes = fc.constantFrom(
        ActivityType.CREATE_EXPENSE,
        ActivityType.UPDATE_EXPENSE,
        ActivityType.DELETE_EXPENSE,
        ActivityType.UPDATE_GROUP,
      )

      fc.assert(
        fc.property(
          arbAllActivityTypes,
          arbGroupId,
          arbGroupName,
          fc.option(arbExpenseTitle, { nil: undefined }),
          arbActorName,
          (activityType, groupId, groupName, expenseTitle, actorName) => {
            const payload = buildPushPayload(
              activityType,
              groupId,
              groupName,
              expenseTitle,
              actorName,
            )

            // Payload SHALL contain a localeKey string
            expect(typeof payload.localeKey).toBe('string')
            expect(payload.localeKey.length).toBeGreaterThan(0)

            // Payload SHALL contain a params object
            expect(typeof payload.params).toBe('object')
            expect(payload.params).not.toBeNull()

            // Payload SHALL NOT contain pre-rendered title or body text fields
            // (at the top level of the payload object)
            const payloadAsRecord = payload as unknown as Record<
              string,
              unknown
            >
            expect(payloadAsRecord).not.toHaveProperty('title')
            expect(payloadAsRecord).not.toHaveProperty('body')
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('localeKey is always a namespaced key starting with "notifications."', () => {
      const arbAllActivityTypes = fc.constantFrom(
        ActivityType.CREATE_EXPENSE,
        ActivityType.UPDATE_EXPENSE,
        ActivityType.DELETE_EXPENSE,
        ActivityType.UPDATE_GROUP,
      )

      fc.assert(
        fc.property(
          arbAllActivityTypes,
          arbGroupId,
          arbGroupName,
          fc.option(arbExpenseTitle, { nil: undefined }),
          arbActorName,
          (activityType, groupId, groupName, expenseTitle, actorName) => {
            const payload = buildPushPayload(
              activityType,
              groupId,
              groupName,
              expenseTitle,
              actorName,
            )

            // localeKey should be a namespaced key, not pre-rendered text
            expect(payload.localeKey).toMatch(/^notifications\./)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('params values are all strings suitable for interpolation', () => {
      const arbAllActivityTypes = fc.constantFrom(
        ActivityType.CREATE_EXPENSE,
        ActivityType.UPDATE_EXPENSE,
        ActivityType.DELETE_EXPENSE,
        ActivityType.UPDATE_GROUP,
      )

      fc.assert(
        fc.property(
          arbAllActivityTypes,
          arbGroupId,
          arbGroupName,
          fc.option(arbExpenseTitle, { nil: undefined }),
          arbActorName,
          (activityType, groupId, groupName, expenseTitle, actorName) => {
            const payload = buildPushPayload(
              activityType,
              groupId,
              groupName,
              expenseTitle,
              actorName,
            )

            // All param values must be strings (for locale interpolation)
            for (const value of Object.values(payload.params)) {
              expect(typeof value).toBe('string')
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
