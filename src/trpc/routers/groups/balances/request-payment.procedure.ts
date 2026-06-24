import { getGroup } from '@/lib/api'
import { emailService } from '@/lib/auth/email-service'
import { prisma } from '@/lib/prisma'
import { isBlockedBy } from '@/lib/profile/block-check'
import {
  buildSettleBalancesUrl,
  findMatchingReimbursement,
  getSuggestedReimbursementsForGroup,
} from '@/lib/settlements'
import { getCurrencyFromGroup } from '@/lib/utils'
import { groupMemberProcedure } from '@/trpc/init'
import { GroupType } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const requestPaymentProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
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

    if (await isBlockedBy(ctx.user.id, input.fromUserId)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Unable to send payment request.',
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
      group.type === GroupType.DYAD,
    )

    if (!result.ok) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error || 'Failed to send payment request email.',
      })
    }

    return { ok: true as const }
  })
