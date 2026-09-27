jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))

import { prisma } from '@/lib/prisma'
import { signOutAllDevices } from '@/lib/profile/profile-service'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    user: {
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    session: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    pushSubscription: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}))

describe('signOutAllDevices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('updates sessionsInvalidatedAt and deletes all sessions and push subscriptions', async () => {
    await signOutAllDevices('user-1')

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        sessionsInvalidatedAt: expect.any(Date),
      },
    })
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })
})
