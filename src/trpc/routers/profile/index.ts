import { prisma } from '@/lib/prisma'
import { changeName, changePassword } from '@/lib/profile/profile-service'
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

export const profileRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { id: true, name: true, email: true },
    })

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
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
})
