import { prisma } from '@/lib/prisma'
import { baseProcedure, createTRPCRouter } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const createInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  groupId: z.string().min(1),
  participantName: z.string().max(50).optional(),
})

const deleteInputSchema = z.object({
  endpoint: z.string().max(2048),
  groupId: z.string().min(1),
})

const listInputSchema = z.object({
  endpoint: z.string().max(2048),
})

export const pushSubscriptionsRouter = createTRPCRouter({
  create: baseProcedure.input(createInputSchema).mutation(async ({ input }) => {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
    })

    if (!group) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Group not found.',
      })
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: {
        endpoint_groupId: {
          endpoint: input.endpoint,
          groupId: input.groupId,
        },
      },
      create: {
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        groupId: input.groupId,
        participantName: input.participantName ?? null,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        participantName: input.participantName ?? null,
      },
    })

    return { id: subscription.id }
  }),

  delete: baseProcedure.input(deleteInputSchema).mutation(async ({ input }) => {
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: input.endpoint,
        groupId: input.groupId,
      },
    })

    return { success: true }
  }),

  list: baseProcedure.input(listInputSchema).query(async ({ input }) => {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { endpoint: input.endpoint },
      select: {
        groupId: true,
        participantName: true,
      },
    })

    return subscriptions
  }),
})
