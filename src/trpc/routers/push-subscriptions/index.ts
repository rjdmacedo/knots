import { prisma } from '@/lib/prisma'
import { baseProcedure, createTRPCRouter } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const preferencesSchema = z
  .object({
    subscriberUserId: z.string().min(1).max(200),
    notifyAllMembers: z.boolean(),
    includedUserIds: z.array(z.string().min(1).max(200)).max(50),
    notifyOnCreate: z.boolean(),
    notifyOnUpdate: z.boolean(),
    notifyOnDelete: z.boolean(),
  })
  .refine((p) => p.notifyAllMembers || p.includedUserIds.length > 0, {
    message: 'Select at least one member.',
  })

const createInputSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  groupId: z.string().min(1),
  preferences: preferencesSchema,
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

    const { preferences } = input
    const hasEventFilter =
      preferences.notifyOnCreate ||
      preferences.notifyOnUpdate ||
      preferences.notifyOnDelete

    if (!hasEventFilter) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Select at least one event type.',
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
        subscriberUserId: preferences.subscriberUserId,
        notifyAllMembers: preferences.notifyAllMembers,
        includedUserIds: preferences.includedUserIds,
        notifyOnCreate: preferences.notifyOnCreate,
        notifyOnUpdate: preferences.notifyOnUpdate,
        notifyOnDelete: preferences.notifyOnDelete,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        subscriberUserId: preferences.subscriberUserId,
        notifyAllMembers: preferences.notifyAllMembers,
        includedUserIds: preferences.includedUserIds,
        notifyOnCreate: preferences.notifyOnCreate,
        notifyOnUpdate: preferences.notifyOnUpdate,
        notifyOnDelete: preferences.notifyOnDelete,
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
        subscriberUserId: true,
        notifyAllMembers: true,
        includedUserIds: true,
        notifyOnCreate: true,
        notifyOnUpdate: true,
        notifyOnDelete: true,
      },
    })

    return subscriptions
  }),
})
