import { ActivityType, Prisma } from '@prisma/client'
import {
  planAccountNotification,
  planGroupActivityNotifications,
} from './planner'

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    user: { findUnique: jest.fn() },
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]) },
    notificationDelivery: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    group: { findUnique: jest.fn() },
    expense: { findUnique: jest.fn() },
    ...overrides,
  } as unknown as Prisma.TransactionClient
}

describe('notification delivery planner', () => {
  it('does not silently replace push with email when no push target exists', async () => {
    const tx = transaction()
    jest.mocked(tx.user.findUnique).mockResolvedValue({
      notificationsEnabled: true,
      notificationPreferences: [{ email: false, push: true }],
    } as never)

    const count = await planAccountNotification(tx, {
      eventKey: 'friend:1',
      category: 'friend-added',
      recipient: { userId: 'user-1', email: 'friend@example.com' },
      template: 'friend-invite',
      url: '/friends',
      params: { inviterName: 'Rafael', hasAccount: true },
    })

    expect(count).toBe(0)
    expect(tx.notificationDelivery.createMany).not.toHaveBeenCalled()
  })

  it('plans default email for an invitee without an account', async () => {
    const tx = transaction()
    jest.mocked(tx.notificationDelivery.createMany).mockResolvedValue({
      count: 1,
    })

    await planAccountNotification(tx, {
      eventKey: 'group-invitation:1',
      category: 'added-to-group',
      recipient: { email: 'NEW@EXAMPLE.COM' },
      template: 'group-invitation',
      url: '/invite/1',
      params: { groupName: 'Trip' },
    })

    expect(tx.notificationDelivery.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            recipientKey: 'email:new@example.com',
            targetKey: 'new@example.com',
            category: 'added-to-group',
          }),
        ],
      }),
    )
  })

  it('applies a group override after the account preference', async () => {
    const tx = transaction()
    jest.mocked(tx.group.findUnique).mockResolvedValue({
      name: 'Trip',
      memberships: [
        {
          id: 'membership-1',
          userId: 'recipient-1',
          user: {
            email: 'recipient@example.com',
            emailVerified: new Date(),
            locale: 'pt-PT',
            name: 'Recipient',
          },
          notificationOverrides: [{ email: false, push: true }],
        },
      ],
    } as never)
    jest.mocked(tx.user.findUnique).mockResolvedValue({
      notificationsEnabled: true,
      notificationPreferences: [{ email: true, push: false }],
    } as never)
    jest.mocked(tx.pushSubscription.findMany).mockResolvedValue([
      {
        id: 'subscription-1',
        userId: 'recipient-1',
        endpoint: 'https://push.example/1',
        p256dh: 'key',
        auth: 'auth',
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    jest.mocked(tx.notificationDelivery.createMany).mockResolvedValue({
      count: 1,
    })

    await planGroupActivityNotifications(tx, {
      eventKey: 'activity:1',
      groupId: 'group-1',
      activityType: ActivityType.CREATE_EXPENSE,
      actorUserId: 'actor-1',
      expenseId: 'expense-1',
      expenseTitle: 'Dinner',
    })

    const args = jest.mocked(tx.notificationDelivery.createMany).mock
      .calls[0]?.[0]
    expect(args).toBeDefined()
    const rows = Array.isArray(args!.data) ? args!.data : [args!.data]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        channel: 'PUSH',
        targetKey: 'subscription-1',
      }),
    )
  })
})
