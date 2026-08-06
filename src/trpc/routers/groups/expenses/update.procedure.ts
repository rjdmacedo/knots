import { updateExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { prisma } from '@/lib/prisma'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'
import { resolveUpdateConversion } from './resolve-update-conversion'

export const updateGroupExpenseProcedure = groupMemberProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
    }),
  )
  .mutation(
    async ({
      input: { expenseId, groupId, expenseFormValues },
      ctx: { user },
    }) => {
      // Fetch existing expense and group for conversion change detection
      const [existingExpense, group] = await Promise.all([
        prisma.expense.findUniqueOrThrow({
          where: { id: expenseId },
          select: {
            originalAmount: true,
            originalCurrency: true,
            expenseDate: true,
            amount: true,
            conversionRate: true,
          },
        }),
        prisma.group.findUniqueOrThrow({
          where: { id: groupId },
          select: { currencyCode: true },
        }),
      ])

      // Resolve conversion for update
      const conversion = await resolveUpdateConversion({
        amount: expenseFormValues.amount,
        originalAmount: expenseFormValues.originalAmount ?? undefined,
        originalCurrency: expenseFormValues.originalCurrency,
        expenseDate: expenseFormValues.expenseDate,
        conversionRate: expenseFormValues.conversionRate ?? undefined,
        groupCurrencyCode: group.currencyCode,
        existingExpense,
      })

      expenseFormValues.amount = conversion.amount
      // Keep null so Prisma clears conversion columns on same-currency updates
      // (`undefined` would leave stale DB values untouched).
      expenseFormValues.originalAmount = conversion.originalAmount
      expenseFormValues.originalCurrency = conversion.originalCurrency
      expenseFormValues.conversionRate = conversion.conversionRate

      const expense = await updateExpense(
        groupId,
        expenseId,
        expenseFormValues,
        user.id,
      )
      notifyOnActivity(groupId, ActivityType.UPDATE_EXPENSE, {
        userId: user.id,
        expenseId: expense.id,
      })

      // Upsert category mapping (secondary operation - must not block the main update)
      try {
        await upsertCategoryMapping({
          groupId,
          title: expenseFormValues.title,
          categoryId: expenseFormValues.category,
          isReimbursement: expenseFormValues.isReimbursement,
        })
      } catch (error) {
        console.error('Failed to upsert category mapping:', error)
      }

      return { expenseId: expense.id }
    },
  )
