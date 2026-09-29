const mockSendGroupActivityEmail = jest.fn()
const mockUpdateMany = jest.fn()
const mockFindUnique = jest.fn()

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendGroupActivityDigestEmail: (...args: unknown[]) =>
      mockSendGroupActivityEmail(...args),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    notificationDelivery: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    pushSubscription: { deleteMany: jest.fn() },
  },
}))

import { getAppBaseUrl } from '@/lib/passkey/config'
import { NotificationDeliveryStatus } from '@prisma/client'
import { processNotificationDelivery } from './delivery-service'

describe('notification delivery worker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not call a provider when another worker owns the delivery', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })

    await expect(processNotificationDelivery('delivery-1')).resolves.toBe(
      'skipped',
    )
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockSendGroupActivityEmail).not.toHaveBeenCalled()
  })

  it('marks a successfully delivered email as sent', async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValue({
      id: 'delivery-1',
      attempts: 1,
      availableAt: new Date(),
      snapshot: {
        kind: 'email',
        template: 'group-activity',
        locale: 'en-US',
        to: 'user@example.com',
        url: '/groups/1/expenses',
        params: { actorName: 'Alice', groupName: 'Trip' },
      },
    })
    mockSendGroupActivityEmail.mockResolvedValue({ ok: true })

    await expect(processNotificationDelivery('delivery-1')).resolves.toBe(
      'sent',
    )
    expect(mockSendGroupActivityEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Alice',
      'Trip',
      new URL('/groups/1/expenses', getAppBaseUrl()).href,
      '',
      '',
    )
    expect(mockUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.SENT,
          leaseToken: null,
        }),
      }),
    )
  })

  it('returns a transient provider failure to the pending outbox', async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
    mockFindUnique.mockResolvedValue({
      id: 'delivery-1',
      attempts: 1,
      availableAt: new Date(),
      snapshot: {
        kind: 'email',
        template: 'group-activity',
        locale: 'en-US',
        to: 'user@example.com',
        url: '/groups/1/expenses',
        params: { actorName: 'Alice', groupName: 'Trip' },
      },
    })
    mockSendGroupActivityEmail.mockResolvedValue({
      ok: false,
      error: 'temporary outage',
    })

    await expect(processNotificationDelivery('delivery-1')).resolves.toBe(
      'retry',
    )
    expect(mockUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.PENDING,
          lastError: 'temporary outage',
        }),
      }),
    )
  })
})
