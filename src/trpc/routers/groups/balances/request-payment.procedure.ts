import { getGroup } from '@/lib/api'
import { emailService } from '@/lib/auth/email-service'
import { prisma } from '@/lib/prisma'
import { isBlockedBy } from '@/lib/profile/block-check'
import {
  buildFriendBalancesUrl,
  buildSettleBalancesUrl,
  findMatchingReimbursement,
  getSuggestedReimbursementsForGroup,
} from '@/lib/settlements'
import { getCurrencyFromGroup } from '@/lib/utils'
import { protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const requestPaymentProcedure = protectedProcedure
  .input(
    z.object({
      groupId: z.string().min(1).nullable(),
      fromUserId: z.string().min(1),
      toUserId: z.string().min(1),
      amount: z.number().int().positive(),
      message: z.string().max(500).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (ctx.user.id !== input.toUserId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only request payment for balances owed to you.',
      })
    }

    if (await isBlockedBy(ctx.user.id, input.fromUserId)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Unable to send payment request.',
      })
    }

    // Direct payment request (no group)
    if (input.groupId === null) {
      // Verify friendship exists
      const friend = await prisma.friend.findFirst({
        where: {
          userId: ctx.user.id,
          friendUserId: input.fromUserId,
        },
        select: { id: true },
      })

      if (!friend) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      const [debtor, creditor] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.fromUserId },
          select: { email: true, name: true },
        }),
        prisma.user.findUnique({
          where: { id: input.toUserId },
          select: { name: true, preferredCurrency: true },
        }),
      ])

      if (!debtor || !creditor) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Participant not found.',
        })
      }

      const currencyCode = creditor.preferredCurrency || 'EUR'
      const formattedAmount = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
      }).format(input.amount / 100)

      const balancesLink = buildFriendBalancesUrl(friend.id)

      const result = await emailService.sendPaymentRequestEmail(
        debtor.email,
        creditor.name,
        'Direct', // context label instead of group name
        formattedAmount,
        balancesLink,
        input.message,
        false,
      )

      if (!result.ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to send payment request email.',
        })
      }

      return { ok: true as const }
    }

    // Group payment request — verify group membership
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: ctx.user.id,
          groupId: input.groupId,
        },
      },
    })

    if (!membership) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Group not found.',
      })
    }

    const reimbursements = await getSuggestedReimbursementsForGroup(
      input.groupId,
    )
    const match = findMatchingReimbursement(
      reimbursements,
      input.fromUserId,
      input.toUserId,
      input.amount,
    )

    if (!match) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This payment is no longer suggested for the group.',
      })
    }

    const [group, debtor, creditor] = await Promise.all([
      getGroup(input.groupId),
      prisma.user.findUnique({
        where: { id: input.fromUserId },
        select: { email: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: input.toUserId },
        select: { name: true },
      }),
    ])

    if (!group || !debtor || !creditor) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Group or participant not found.',
      })
    }

    const currency = getCurrencyFromGroup(group)
    const formattedAmount = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.code || 'EUR',
    }).format(input.amount / 10 ** currency.decimal_digits)

    const result = await emailService.sendPaymentRequestEmail(
      debtor.email,
      creditor.name,
      group.name,
      formattedAmount,
      buildSettleBalancesUrl(input.groupId),
      input.message,
      false,
    )

    if (!result.ok) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error || 'Failed to send payment request email.',
      })
    }

    return { ok: true as const }
  })
