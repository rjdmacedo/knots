import { TRPCError } from '@trpc/server'

const mockFindUnique = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockDeleteMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

jest.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
  },
}))

jest.mock('@/trpc/init', () => {
  const { initTRPC, TRPCError: InitTRPCError } = require('@trpc/server')
  const t = initTRPC.context().create()
  return {
    createTRPCRouter: t.router,
    protectedProcedure: t.procedure.use(async ({ ctx, next }: any) => {
      if (!ctx.session?.user?.id) {
        throw new InitTRPCError({ code: 'UNAUTHORIZED' })
      }
      return next({
        ctx: {
          ...ctx,
          user: { id: ctx.session.user.id },
        },
      })
    }),
  }
})

jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json,
    registerCustom: jest.fn(),
  },
}))

import { pushSubscriptionsRouter } from '../index'

const USER_ID = 'user-1'
const ENDPOINT = 'https://push.example.com/device'
const INPUT = {
  endpoint: ENDPOINT,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  userAgent: 'TestAgent',
}

function caller(userId = USER_ID) {
  return pushSubscriptionsRouter.createCaller({
    session: {
      user: { id: userId },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  } as never)
}

describe('push subscriptions router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the server VAPID public key', async () => {
    await expect(caller().getConfig()).resolves.toEqual({
      configured: true,
      vapidPublicKey: 'test-public-key',
    })
  })

  it('creates a subscription owned by the session user', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'sub-1', endpoint: ENDPOINT })

    await caller().register(INPUT)

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        endpoint: ENDPOINT,
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        userAgent: 'TestAgent',
      },
      select: { id: true, endpoint: true },
    })
  })

  it('updates keys when the same account already owns the endpoint', async () => {
    mockFindUnique.mockResolvedValue({ id: 'sub-1', userId: USER_ID })
    mockUpdate.mockResolvedValue({ id: 'sub-1', endpoint: ENDPOINT })

    await caller().register(INPUT)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
          userAgent: 'TestAgent',
        },
      }),
    )
  })

  it('rejects an endpoint that belongs to another account', async () => {
    mockFindUnique.mockResolvedValue({ id: 'sub-1', userId: 'someone-else' })

    await expect(caller().register(INPUT)).rejects.toBeInstanceOf(TRPCError)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('removes only the session user row for this endpoint', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })

    await expect(caller().remove({ endpoint: ENDPOINT })).resolves.toEqual({
      removed: true,
    })
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: USER_ID },
    })
  })

  it('reports subscribed only when the endpoint belongs to the session user', async () => {
    mockFindUnique.mockResolvedValue({ userId: USER_ID })
    await expect(caller().status({ endpoint: ENDPOINT })).resolves.toEqual({
      subscribed: true,
    })

    mockFindUnique.mockResolvedValue({ userId: 'someone-else' })
    await expect(caller().status({ endpoint: ENDPOINT })).resolves.toEqual({
      subscribed: false,
    })
  })
})
