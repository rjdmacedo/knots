import { locales, type Locale } from '@/i18n'
import {
  emailChangeService,
  type EmailChangeError,
} from '@/lib/auth/email-change-service'
import {
  getNotificationPreferences,
  saveNotificationCategory,
  setNotificationsEnabled,
} from '@/lib/notifications/notification-preferences-service'
import { confirmRecentPassword } from '@/lib/passkey'
import { prisma } from '@/lib/prisma'
import {
  blockUser,
  changeName,
  changePassword,
  changePreferences,
  getBlockedUsers,
  presignImage,
  removeImage,
  removePassword,
  setImage,
  setPassword,
  signOutAllDevices,
  unblockUser,
} from '@/lib/profile/profile-service'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

const changeNameSchema = z.object({
  name: z.string(),
})

const changeUsernameSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(40, 'Username must be at most 40 characters')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Username must only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)',
    ),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
})

const removePasswordSchema = z.object({
  currentPassword: z.string(),
})

const setPasswordSchema = z.object({
  newPassword: z.string(),
})

const confirmRecentPasswordSchema = z.object({
  currentPassword: z.string(),
})

const changePreferencesSchema = z.object({
  timezone: z.string().optional(),
  preferredCurrency: z.string().optional(),
  locale: z.enum(locales as [string, ...string[]]).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
})

const presignImageSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

const setImageSchema = z.object({
  key: z.string().min(1),
  signature: z.string().min(1),
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

const requestEmailChangeSchema = z.object({
  email: z.string(),
})

const confirmEmailChangeSchema = z.object({
  email: z.string(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
})

const saveNotificationCategorySchema = z.object({
  category: z.string().min(1),
  email: z.boolean(),
  push: z.boolean(),
})

const setNotificationsEnabledSchema = z.object({
  enabled: z.boolean(),
})

/**
 * Maps profile-image service errors to `TRPCError`s. The unavailable error keeps
 * its recognizable `IMAGE_STORAGE_UNAVAILABLE` code in the `cause` so the client
 * can map it to an "unavailable" toast rather than a generic failure.
 */
function imageErrorToTRPCError(error: {
  code: string
  message: string
}): TRPCError {
  if (error.code === 'IMAGE_STORAGE_UNAVAILABLE') {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: error.message,
      cause: error,
    })
  }

  return new TRPCError({
    code: 'BAD_REQUEST',
    message: error.message,
    cause: error,
  })
}

/**
 * Maps an `EmailChangeError` from the email-change service to a `TRPCError`.
 * The recognizable error code is carried in `cause` (following the
 * `imageErrorToTRPCError` pattern) so the UI can map each code — `EMAIL_IN_USE`,
 * `INVALID_EMAIL`, `SAME_EMAIL`, `INVALID_OTP`, `OTP_EXPIRED`, `RATE_LIMITED`,
 * `EMAIL_SEND_FAILED` — to a specific message.
 */
function emailChangeErrorToTRPCError(error: EmailChangeError): TRPCError {
  const messages: Record<EmailChangeError, string> = {
    INVALID_EMAIL: 'Enter a valid email address.',
    SAME_EMAIL: 'That is already your email address.',
    EMAIL_IN_USE: 'That email is already in use by another account.',
    INVALID_OTP: 'That code is not correct.',
    OTP_EXPIRED: 'That code has expired. Request a new one.',
    RATE_LIMITED: 'Too many attempts. Please try again later.',
    EMAIL_SEND_FAILED: 'We could not send the code. Please try again later.',
  }

  const code: TRPCError['code'] =
    error === 'RATE_LIMITED'
      ? 'TOO_MANY_REQUESTS'
      : error === 'EMAIL_IN_USE'
        ? 'CONFLICT'
        : error === 'EMAIL_SEND_FAILED'
          ? 'INTERNAL_SERVER_ERROR'
          : 'BAD_REQUEST'

  return new TRPCError({
    code,
    message: messages[error],
    cause: error,
  })
}

export const profileRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        timezone: true,
        preferredCurrency: true,
        image: true,
        locale: true,
        theme: true,
        notificationsEnabled: true,
        emailVerified: true,
        passwordHash: true,
      },
    })

    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Session expired.',
      })
    }

    const { passwordHash, ...rest } = user

    return {
      ...rest,
      hasPassword: passwordHash !== null,
    }
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

  changeUsername: protectedProcedure
    .input(changeUsernameSchema)
    .mutation(async ({ ctx, input }) => {
      const normalized = input.username.toLowerCase()

      // Check if username is already taken by another user
      const existing = await prisma.user.findUnique({
        where: { username: normalized },
        select: { id: true },
      })

      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This username is already taken.',
        })
      }

      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { username: normalized },
      })

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

  setPassword: protectedProcedure
    .input(setPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await setPassword(ctx.user.id, input.newPassword)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  removePassword: protectedProcedure
    .input(removePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await removePassword(ctx.user.id, input.currentPassword)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  /**
   * Confirms the current password and refreshes the recent-auth marker read by
   * the 5-minute add-passkey gate (requirement 7.4). Returns the generic
   * mismatch error without revealing whether the account has a password.
   */
  confirmRecentPassword: protectedProcedure
    .input(confirmRecentPasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await confirmRecentPassword(
        ctx.user.id,
        input.currentPassword,
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

  requestEmailChange: protectedProcedure
    .input(requestEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { email: true },
      })

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Session expired.',
        })
      }

      const result = await emailChangeService.requestEmailChange({
        userId: ctx.user.id,
        currentEmail: user.email,
        newEmail: input.email,
      })

      if (!result.ok) {
        throw emailChangeErrorToTRPCError(result.error)
      }

      return { success: true }
    }),

  confirmEmailChange: protectedProcedure
    .input(confirmEmailChangeSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await emailChangeService.confirmEmailChange({
        userId: ctx.user.id,
        newEmail: input.email,
        code: input.code,
      })

      if (!result.ok) {
        throw emailChangeErrorToTRPCError(result.error)
      }

      return { success: true }
    }),

  changePreferences: protectedProcedure
    .input(changePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await changePreferences(ctx.user.id, {
        timezone: input.timezone,
        preferredCurrency: input.preferredCurrency,
        locale: input.locale as Locale | undefined,
        theme: input.theme,
      })

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
          cause: result.error,
        })
      }

      return { success: true }
    }),

  /**
   * Returns the signed-in user's effective notification channel state for every
   * live category (stored rows merged over defaults) plus the master switch.
   */
  notificationPreferences: protectedProcedure.query(async ({ ctx }) => {
    return getNotificationPreferences(ctx.user.id)
  }),

  /**
   * Saves the channel preference for a single category (requirement 9.7, 9.11).
   * Rejects unknown or coming-soon categories.
   */
  saveNotificationCategory: protectedProcedure
    .input(saveNotificationCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await saveNotificationCategory(
        ctx.user.id,
        input.category,
        {
          email: input.email,
          push: input.push,
        },
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

  /** Sets the master notification switch (`User.notificationsEnabled`). */
  setNotificationsEnabled: protectedProcedure
    .input(setNotificationsEnabledSchema)
    .mutation(async ({ ctx, input }) => {
      await setNotificationsEnabled(ctx.user.id, input.enabled)
      return { success: true }
    }),

  presignImage: protectedProcedure
    .input(presignImageSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await presignImage(ctx.user.id, input.contentType)

      if (!result.ok) {
        throw imageErrorToTRPCError(result.error)
      }

      return result.value
    }),

  setImage: protectedProcedure
    .input(setImageSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await setImage(ctx.user.id, input.key, input.signature)

      if (!result.ok) {
        throw imageErrorToTRPCError(result.error)
      }

      return { success: true, image: result.value!.image }
    }),

  removeImage: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await removeImage(ctx.user.id)

    if (!result.ok) {
      throw imageErrorToTRPCError(result.error)
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
