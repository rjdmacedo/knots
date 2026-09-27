/**
 * Unit tests for the notification preferences service.
 *
 * Verifies the merge of stored rows over defaults, the master switch, the
 * per-category upsert, and rejection of unknown / coming-soon categories.
 */

const mockUserFindUnique = jest.fn()
const mockUserFindMany = jest.fn()
const mockUserUpdate = jest.fn()
const mockPrefFindMany = jest.fn()
const mockPrefUpsert = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    userNotificationPreference: {
      findMany: (...args: unknown[]) => mockPrefFindMany(...args),
      upsert: (...args: unknown[]) => mockPrefUpsert(...args),
    },
  },
}))

import {
  getNotificationPreferences,
  getNotificationPreferencesForUsers,
  isCategoryChannelAllowed,
  saveNotificationCategory,
  setNotificationsEnabled,
} from './notification-preferences-service'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getNotificationPreferences', () => {
  it('returns defaults for every live category when no rows exist', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationsEnabled: true })
    mockPrefFindMany.mockResolvedValue([])

    const result = await getNotificationPreferences('user-1')

    expect(result.notificationsEnabled).toBe(true)
    expect(result.categories['added-to-group']).toEqual({
      email: true,
      push: true,
    })
    expect(result.categories['recurring-expense-created']).toEqual({
      email: true,
      push: false,
    })
    // Coming-soon categories are not returned.
    expect(result.categories['weekly-summary']).toBeUndefined()
    // All seven live categories present.
    expect(Object.keys(result.categories)).toHaveLength(7)
  })

  it('merges stored rows over the defaults', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationsEnabled: true })
    mockPrefFindMany.mockResolvedValue([
      { category: 'added-to-group', email: false, push: false },
      { category: 'expense-changed', email: true, push: true },
    ])

    const result = await getNotificationPreferences('user-1')

    expect(result.categories['added-to-group']).toEqual({
      email: false,
      push: false,
    })
    expect(result.categories['expense-changed']).toEqual({
      email: true,
      push: true,
    })
    // Untouched category keeps its default.
    expect(result.categories['friend-added']).toEqual({
      email: true,
      push: true,
    })
  })

  it('reflects the master switch and defaults to true when the user is missing', async () => {
    mockUserFindUnique.mockResolvedValue({ notificationsEnabled: false })
    mockPrefFindMany.mockResolvedValue([])
    expect((await getNotificationPreferences('u')).notificationsEnabled).toBe(
      false,
    )

    mockUserFindUnique.mockResolvedValue(null)
    expect((await getNotificationPreferences('u')).notificationsEnabled).toBe(
      true,
    )
  })
})

describe('saveNotificationCategory', () => {
  it('upserts a live category', async () => {
    mockPrefUpsert.mockResolvedValue({})

    const result = await saveNotificationCategory('user-1', 'expense-created', {
      email: false,
      push: true,
    })

    expect(result.ok).toBe(true)
    expect(mockPrefUpsert).toHaveBeenCalledWith({
      where: {
        userId_category: { userId: 'user-1', category: 'expense-created' },
      },
      create: {
        userId: 'user-1',
        category: 'expense-created',
        email: false,
        push: true,
      },
      update: { email: false, push: true },
    })
  })

  it('rejects a coming-soon category without touching the DB', async () => {
    const result = await saveNotificationCategory('user-1', 'weekly-summary', {
      email: true,
      push: false,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNKNOWN_CATEGORY')
    expect(mockPrefUpsert).not.toHaveBeenCalled()
  })

  it('rejects an unknown category', async () => {
    const result = await saveNotificationCategory('user-1', 'made-up', {
      email: true,
      push: true,
    })

    expect(result.ok).toBe(false)
    expect(mockPrefUpsert).not.toHaveBeenCalled()
  })
})

describe('getNotificationPreferencesForUsers', () => {
  it('returns an empty map without querying when no ids are given', async () => {
    const result = await getNotificationPreferencesForUsers([])

    expect(result.size).toBe(0)
    expect(mockUserFindMany).not.toHaveBeenCalled()
    expect(mockPrefFindMany).not.toHaveBeenCalled()
  })

  it('deduplicates ids and batches into a single query per table', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'a', notificationsEnabled: true },
      { id: 'b', notificationsEnabled: false },
    ])
    mockPrefFindMany.mockResolvedValue([])

    await getNotificationPreferencesForUsers(['a', 'b', 'a', 'b'])

    expect(mockUserFindMany).toHaveBeenCalledTimes(1)
    expect(mockPrefFindMany).toHaveBeenCalledTimes(1)
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      select: { id: true, notificationsEnabled: true },
    })
  })

  it('merges stored rows over defaults per user and defaults missing users to enabled', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'a', notificationsEnabled: false },
    ])
    mockPrefFindMany.mockResolvedValue([
      { userId: 'a', category: 'expense-created', email: false, push: false },
    ])

    const result = await getNotificationPreferencesForUsers(['a', 'b'])

    // User a: master off, stored expense-created override applied.
    expect(result.get('a')?.notificationsEnabled).toBe(false)
    expect(result.get('a')?.categories['expense-created']).toEqual({
      email: false,
      push: false,
    })
    // User b: no user row -> defaults to enabled, categories fall back to design.
    expect(result.get('b')?.notificationsEnabled).toBe(true)
    expect(result.get('b')?.categories['expense-created']).toEqual({
      email: true,
      push: true,
    })
  })
})

describe('isCategoryChannelAllowed', () => {
  const prefs = {
    notificationsEnabled: true,
    categories: {
      'expense-created': { email: true, push: false },
    },
  }

  it('allows any channel for an unmapped (null) category', () => {
    expect(isCategoryChannelAllowed(undefined, null, 'push')).toBe(true)
    expect(isCategoryChannelAllowed(prefs, null, 'email')).toBe(true)
  })

  it('blocks every channel when the master switch is off', () => {
    const off = { notificationsEnabled: false, categories: {} }
    expect(isCategoryChannelAllowed(off, 'expense-created', 'push')).toBe(false)
    expect(isCategoryChannelAllowed(off, 'expense-created', 'email')).toBe(
      false,
    )
  })

  it('honors the per-category channel flag', () => {
    expect(isCategoryChannelAllowed(prefs, 'expense-created', 'email')).toBe(
      true,
    )
    expect(isCategoryChannelAllowed(prefs, 'expense-created', 'push')).toBe(
      false,
    )
  })

  it('falls back to design defaults when preferences are missing', () => {
    // expense-created default is email+push on.
    expect(isCategoryChannelAllowed(undefined, 'expense-created', 'push')).toBe(
      true,
    )
    // expense-changed has no default -> both off.
    expect(
      isCategoryChannelAllowed(undefined, 'expense-changed', 'email'),
    ).toBe(false)
  })

  it('uses defaults for a category absent from the resolved prefs', () => {
    // prefs has no expense-changed entry; default is both off.
    expect(isCategoryChannelAllowed(prefs, 'expense-changed', 'push')).toBe(
      false,
    )
  })
})

describe('setNotificationsEnabled', () => {
  it('updates the master switch', async () => {
    mockUserUpdate.mockResolvedValue({})

    await setNotificationsEnabled('user-1', false)

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { notificationsEnabled: false },
    })
  })
})
