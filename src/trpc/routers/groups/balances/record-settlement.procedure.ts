import { createExpense, getGroup } from '@/lib/api'
import { emailService } from '@/lib/auth/email-service'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { prisma } from '@/lib/prisma'
import { isBlockedBy } from '@/lib/profile/block-check'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import {
  buildFriendBalancesUrl,
  buildSettleBalancesUrl,
  buildSettlementFormValues,
  findDebtBetween,
  formatSettlementBalanceStatusForCreditor,
  getSettlementBalanceStatus,
  getSuggestedReimbursementsForGroup,
} from '@/lib/settlements'
import { getCurrencyFromGroup } from '@/lib/utils'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType, GroupType } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const recordSettlementProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      fromUserId: z.string().min(1),
      toUserId: z.string().min(1),
      amount: z.number().int().positive().max(10_000_000_00),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (ctx.user.id !== input.fromUserId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only record payments that you made.',
      })
    }

    const reimbursements = await getSuggestedReimbursementsForGroup(
      input.groupId,
    )
    const debt = findDebtBetween(
      reimbursements,
      input.fromUserId,
      input.toUserId,
    )

    if (!debt) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This payment is no longer suggested for the group.',
      })
    }

    const expenseFormValues = buildSettlementFormValues(
      input.amount,
      input.fromUserId,
      input.toUserId,
      'Settlement',
    )

    const expense = await createExpense(
      expenseFormValues,
      input.groupId,
      ctx.user.id,
    )

    notifyOnActivity(input.groupId, ActivityType.CREATE_EXPENSE, {
      userId: ctx.user.id,
      expenseId: expense.id,
    })

    try {
      await upsertCategoryMapping({
        groupId: input.groupId,
        title: expenseFormValues.title,
        categoryId: expenseFormValues.category,
        isReimbursement: true,
      })
    } catch (error) {
      console.error('Failed to upsert category mapping:', error)
    }

    const group = await getGroup(input.groupId)
    if (group) {
      const isDirectBalance = group.type === GroupType.DYAD
      const [payer, creditor] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.fromUserId },
          select: { name: true },
        }),
        prisma.user.findUnique({
          where: { id: input.toUserId },
          select: { email: true, name: true },
        }),
      ])

      const isBlocked =
        (await isBlockedBy(input.toUserId, input.fromUserId)) ||
        (await isBlockedBy(input.fromUserId, input.toUserId))

      if (payer && creditor && !isBlocked) {
        const currency = getCurrencyFromGroup(group)
        const formattedAmount = new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: currency.code || 'EUR',
        }).format(input.amount / 10 ** currency.decimal_digits)

        let balancesLink = buildSettleBalancesUrl(input.groupId)
        if (isDirectBalance) {
          const friend = await prisma.friend.findFirst({
            where: {
              userId: input.toUserId,
              friendUserId: input.fromUserId,
            },
            select: { id: true },
          })
          if (friend) {
            balancesLink = buildFriendBalancesUrl(friend.id)
          }
        }

        const updatedReimbursements = await getSuggestedReimbursementsForGroup(
          input.groupId,
        )
        const balanceStatus = getSettlementBalanceStatus(
          updatedReimbursements,
          input.fromUserId,
          input.toUserId,
        )
        const remainingBalance = formatSettlementBalanceStatusForCreditor(
          balanceStatus,
          payer.name,
          currency,
        )

        const emailResult = await emailService.sendSettlementRecordedEmail(
          creditor.email,
          payer.name,
          group.name,
          formattedAmount,
          balancesLink,
          remainingBalance,
          isDirectBalance,
        )

        if (!emailResult.ok) {
          console.error(
            `[recordSettlement] Failed to send settlement email to ${creditor.email}:`,
            emailResult.error,
          )
        }
      }
    }

    return { expenseId: expense.id }
  })
