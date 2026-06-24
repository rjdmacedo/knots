import { prisma } from '@/lib/prisma'
import {
  blockUser,
  changeName,
  changePassword,
  changePreferences,
  getBlockedUsers,
  signOutAllDevices,
  unblockUser,
} from '@/lib/profile/profile-service'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const changeNameSchema = z.object({
  name: z.string(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
})

const changePreferencesSchema = z.object({
  timezone: z.string().optional(),
  preferredCurrency: z.string().optional(),
})

const blockUserSchema = z.object({
  email: z.string().email(),
})

const unblockUserSchema = z.object({
  blockedEmail: z.string().email(),
})

const checkBlockedSchema = z.object({
  email: z.string().email(),
})

export const profileRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        timezone: true,
        preferredCurrency: true,
      },
    })

    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Session expired.',
      })
    }

    return user
  }),

  changeName: protectedProcedure
    .input(changeNameSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await changeName(ctx.user.id, input.name)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await changePassword(
        ctx.user.id,
        input.currentPassword,
        input.newPassword,
      )

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  changePreferences: protectedProcedure
    .input(changePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await changePreferences(ctx.user.id, input)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  signOutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
    await signOutAllDevices(ctx.user.id)
    return { success: true }
  }),

  getBlockedUsers: protectedProcedure.query(async ({ ctx }) => {
    return getBlockedUsers(ctx.user.id)
  }),

  blockUser: protectedProcedure
    .input(blockUserSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await blockUser(ctx.user.id, input.email)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  unblockUser: protectedProcedure
    .input(unblockUserSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await unblockUser(ctx.user.id, input.blockedEmail)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  checkBlocked: protectedProcedure
    .input(checkBlockedSchema)
    .query(async ({ ctx, input }) => {
      const { prisma } = await import('@/lib/prisma')
      const block = await prisma.blockedUser.findUnique({
        where: {
          userId_blockedEmail: {
            userId: ctx.user.id,
            blockedEmail: input.email.toLowerCase().trim(),
          },
        },
        select: { id: true },
      })

      return { blocked: block !== null }
    }),
})
