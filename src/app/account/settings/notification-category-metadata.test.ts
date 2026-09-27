/**
 * Unit tests for the notification category metadata module.
 *
 * Covers the design's category map (ids, groups, order), the coming-soon
 * flags, and the default channel resolution.
 */

import {
  LIVE_NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_GROUPS,
  activityTypeToNotificationCategory,
  defaultChannelsFor,
  isComingSoon,
  isLiveCategory,
} from './notification-category-metadata'

describe('notification-category-metadata', () => {
  it('lists the three groups in order', () => {
    expect(NOTIFICATION_GROUPS).toEqual([
      'groups-and-friends',
      'expenses',
      'summaries',
    ])
  })

  it('lists categories in the design order with the correct groups', () => {
    expect(
      NOTIFICATION_CATEGORIES.map((c) => [
        c.id,
        c.group,
        c.comingSoon ?? false,
      ]),
    ).toEqual([
      ['added-to-group', 'groups-and-friends', false],
      ['friend-added', 'groups-and-friends', false],
      ['budget-alert', 'groups-and-friends', false],
      ['expense-created', 'expenses', false],
      ['recurring-expense-created', 'expenses', false],
      ['expense-changed', 'expenses', false],
      ['expense-comment', 'expenses', false],
      ['weekly-summary', 'summaries', true],
    ])
  })

  it('marks only the weekly summary as coming soon', () => {
    expect(isComingSoon('weekly-summary')).toBe(true)
    expect(isComingSoon('expense-created')).toBe(false)
    expect(isComingSoon('unknown')).toBe(false)
  })

  it('excludes coming-soon categories from the live list', () => {
    const liveIds = LIVE_NOTIFICATION_CATEGORIES.map((c) => c.id)
    expect(liveIds).not.toContain('weekly-summary')
    expect(liveIds).toHaveLength(7)
  })

  it('recognizes live categories only', () => {
    expect(isLiveCategory('added-to-group')).toBe(true)
    expect(isLiveCategory('weekly-summary')).toBe(false)
    expect(isLiveCategory('made-up')).toBe(false)
  })

  describe('defaultChannelsFor', () => {
    it('defaults email + push for added-to-group, friend, new expense, comment, budget', () => {
      for (const id of [
        'added-to-group',
        'friend-added',
        'expense-created',
        'expense-comment',
        'budget-alert',
      ]) {
        expect(defaultChannelsFor(id)).toEqual({ email: true, push: true })
      }
    })

    it('defaults email only for recurring expense', () => {
      expect(defaultChannelsFor('recurring-expense-created')).toEqual({
        email: true,
        push: false,
      })
    })

    it('defaults email only (no push) for expense-changed which has no explicit default', () => {
      // expense-changed is live but not in the design's default map; it resolves
      // to both-off rather than throwing.
      expect(defaultChannelsFor('expense-changed')).toEqual({
        email: false,
        push: false,
      })
    })

    it('returns both channels off for coming-soon and unknown categories', () => {
      expect(defaultChannelsFor('weekly-summary')).toEqual({
        email: false,
        push: false,
      })
      expect(defaultChannelsFor('nope')).toEqual({ email: false, push: false })
    })

    it('returns a fresh object each call (no shared mutable default)', () => {
      const a = defaultChannelsFor('added-to-group')
      a.email = false
      expect(defaultChannelsFor('added-to-group')).toEqual({
        email: true,
        push: true,
      })
    })
  })

  describe('activityTypeToNotificationCategory', () => {
    it('maps CREATE_EXPENSE to expense-created', () => {
      expect(activityTypeToNotificationCategory('CREATE_EXPENSE')).toBe(
        'expense-created',
      )
    })

    it('maps UPDATE_EXPENSE and DELETE_EXPENSE to expense-changed', () => {
      expect(activityTypeToNotificationCategory('UPDATE_EXPENSE')).toBe(
        'expense-changed',
      )
      expect(activityTypeToNotificationCategory('DELETE_EXPENSE')).toBe(
        'expense-changed',
      )
    })

    it('maps UPDATE_GROUP to null (no account category)', () => {
      expect(activityTypeToNotificationCategory('UPDATE_GROUP')).toBeNull()
    })
  })
})
