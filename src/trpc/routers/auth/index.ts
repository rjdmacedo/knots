import { authService } from '@/lib/auth/auth-service'
import { baseProcedure, createTRPCRouter } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const registerInputSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string(),
})

const verifyEmailInputSchema = z.object({
  token: z.string().min(1),
})

const resendVerificationInputSchema = z.object({
  email: z.string().email(),
})

const requestPasswordResetInputSchema = z.object({
  email: z.string().email(),
})

const resetPasswordInputSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string(),
})

export const authRouter = createTRPCRouter({
  register: baseProcedure
    .input(registerInputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.register({
        name: input.name,
        email: input.email,
        password: input.password,
      })

      if (!result.ok) {
        const codeMap: Record<string, string> = {
          INVALID_EMAIL: 'BAD_REQUEST',
          INVALID_PASSWORD: 'BAD_REQUEST',
          EMAIL_EXISTS: 'CONFLICT',
          EMAIL_DELIVERY_FAILED: 'INTERNAL_SERVER_ERROR',
        }

        throw new TRPCError({
          code: (codeMap[result.error.code] as any) ?? 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true, userId: result.userId }
    }),

  verifyEmail: baseProcedure
    .input(verifyEmailInputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.verifyEmail(input.token)

      if (!result.ok) {
        const codeMap: Record<string, string> = {
          TOKEN_EXPIRED: 'BAD_REQUEST',
          TOKEN_USED: 'BAD_REQUEST',
          TOKEN_INVALID: 'BAD_REQUEST',
        }

        throw new TRPCError({
          code: (codeMap[result.error.code] as any) ?? 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  resendVerification: baseProcedure
    .input(resendVerificationInputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.resendVerification(input.email)

      if (!result.ok) {
        const codeMap: Record<string, string> = {
          RATE_LIMITED: 'TOO_MANY_REQUESTS',
          EMAIL_DELIVERY_FAILED: 'INTERNAL_SERVER_ERROR',
        }

        throw new TRPCError({
          code: (codeMap[result.error.code] as any) ?? 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  requestPasswordReset: baseProcedure
    .input(requestPasswordResetInputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.requestPasswordReset(input.email)

      if (!result.ok) {
        const codeMap: Record<string, string> = {
          RATE_LIMITED: 'TOO_MANY_REQUESTS',
        }

        throw new TRPCError({
          code: (codeMap[result.error.code] as any) ?? 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
          cause: result.error,
        })
      }

      // Always return success to prevent email enumeration
      return { success: true }
    }),

  resetPassword: baseProcedure
    .input(resetPasswordInputSchema)
    .mutation(async ({ input }) => {
      const result = await authService.resetPassword({
        token: input.token,
        newPassword: input.newPassword,
      })

      if (!result.ok) {
        const codeMap: Record<string, string> = {
          TOKEN_EXPIRED: 'BAD_REQUEST',
          TOKEN_USED: 'BAD_REQUEST',
          TOKEN_INVALID: 'BAD_REQUEST',
          INVALID_PASSWORD: 'BAD_REQUEST',
        }

        throw new TRPCError({
          code: (codeMap[result.error.code] as any) ?? 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),
})
