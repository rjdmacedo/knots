import { auth } from '@/lib/auth/auth'
import { Prisma } from '@prisma/client'
import { initTRPC, TRPCError } from '@trpc/server'
import { get } from 'lodash-es'
import { cache } from 'react'
import superjson from 'superjson'

superjson.registerCustom<Prisma.Decimal, string>(
  {
    isApplicable: (v): v is Prisma.Decimal => Prisma.Decimal.isDecimal(v),
    serialize: (v) => v.toJSON(),
    deserialize: (v) => new Prisma.Decimal(v),
  },
  'decimal.js',
)

import { prisma } from '@/lib/prisma'

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  const session = await auth()
  return { session }
})

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    /**
     * @see https://trpc.io/docs/server/data-transformers
     */
    transformer: superjson,
  })

// Base router and procedure helpers
export const createTRPCRouter = t.router
export const baseProcedure = t.procedure

/**
 * Protected procedure — requires an authenticated session.
 * Throws UNAUTHORIZED if no session is present.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action.',
    })
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user as {
        id: string
        email?: string | null
        name?: string | null
      },
    },
  })
})

/**
 * Group member procedure — requires the user to be a member of the target group.
 * Throws NOT_FOUND if the user is not a member (leaks no existence information).
 */
export const groupMemberProcedure = protectedProcedure.use(
  async ({ ctx, getRawInput, next }) => {
    const rawInput = await getRawInput()
    const groupId = get(rawInput, 'groupId') as string | undefined

    if (!groupId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Group ID is required.',
      })
    }

    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: ctx.user.id,
          groupId,
        },
      },
    })

    if (!membership) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Group not found.',
      })
    }

    return next({
      ctx: {
        ...ctx,
        membership,
      },
    })
  },
)
