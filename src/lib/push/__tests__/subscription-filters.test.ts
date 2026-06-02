import { ActivityType } from '@prisma/client'
import {
  defaultPushPreferences,
  isPushSubscriptionEligible,
} from '../subscription-filters'

describe('subscription-filters', () => {
  const subscriber = 'user-self'
  const other = 'user-other'

  it('never notifies the subscriber about their own actions', () => {
    const prefs = defaultPushPreferences(subscriber)
    expect(
      isPushSubscriptionEligible(
        prefs,
        ActivityType.CREATE_EXPENSE,
        subscriber,
      ),
    ).toBe(false)
  })

  it('notifies for all other members by default', () => {
    const prefs = defaultPushPreferences(subscriber)
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.CREATE_EXPENSE, other),
    ).toBe(true)
  })

  it('respects includedUserIds when notifyAllMembers is false', () => {
    const prefs = {
      ...defaultPushPreferences(subscriber),
      notifyAllMembers: false,
      includedUserIds: ['user-a'],
    }
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.CREATE_EXPENSE, 'user-a'),
    ).toBe(true)
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.CREATE_EXPENSE, 'user-b'),
    ).toBe(false)
  })

  it('respects per-event toggles', () => {
    const prefs = {
      ...defaultPushPreferences(subscriber),
      notifyOnCreate: false,
      notifyOnUpdate: true,
      notifyOnDelete: false,
    }
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.CREATE_EXPENSE, other),
    ).toBe(false)
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.UPDATE_EXPENSE, other),
    ).toBe(true)
    expect(
      isPushSubscriptionEligible(prefs, ActivityType.DELETE_EXPENSE, other),
    ).toBe(false)
  })
})
