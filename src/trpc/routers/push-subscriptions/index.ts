import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}

export const pushSubscriptionsRouter = createTRPCRouter({
  getConfig: protectedProcedure.query(() => ({
    configured: Boolean(
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY,
    ),
    vapidPublicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  })),

  register: protectedProcedure
    .input(
      subscriptionSchema.extend({
        userAgent: z.string().max(512).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id
      const existing = await prisma.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
        select: { id: true, userId: true },
      })
      if (existing && existing.userId !== userId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This browser subscription belongs to another account',
        })
      }

      try {
        const row = existing
          ? await prisma.pushSubscription.update({
              where: { id: existing.id },
              data: {
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
                userAgent: input.userAgent ?? null,
              },
              select: { id: true, endpoint: true },
            })
          : await prisma.pushSubscription.create({
              data: {
                userId,
                endpoint: input.endpoint,
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
                userAgent: input.userAgent ?? null,
              },
              select: { id: true, endpoint: true },
            })
        return { subscription: row }
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error
        const raced = await prisma.pushSubscription.findUnique({
          where: { endpoint: input.endpoint },
          select: { id: true, userId: true },
        })
        if (!raced || raced.userId !== userId) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This browser subscription belongs to another account',
            cause: error,
          })
        }
        const row = await prisma.pushSubscription.update({
          where: { id: raced.id },
          data: {
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: input.userAgent ?? null,
          },
          select: { id: true, endpoint: true },
        })
        return { subscription: row }
      }
    }),

  remove: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(4096) }))
    .mutation(async ({ ctx, input }) => {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.user.id },
      })
      return { removed: true }
    }),

  status: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(4096) }))
    .query(async ({ ctx, input }) => {
      const row = await prisma.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
        select: { userId: true },
      })
      return { subscribed: row?.userId === ctx.user.id }
    }),
})
