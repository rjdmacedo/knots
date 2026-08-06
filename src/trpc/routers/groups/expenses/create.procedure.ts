import { createExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { prisma } from '@/lib/prisma'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'
import { resolveConversion } from './resolve-conversion'

export const createGroupExpenseProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
    }),
  )
  .mutation(async ({ input: { groupId, expenseFormValues }, ctx }) => {
    const userId = ctx.user.id

    // Fetch group currency for conversion resolution
    const group = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { currencyCode: true },
    })

    // Resolve currency conversion (server-authoritative)
    // When conversion is required the client sends originalAmount (in original
    // currency minor units). The `amount` field is a preview in group currency
    // and must NOT be used as the source for conversion.
    const conversionRequired =
      expenseFormValues.originalCurrency != null &&
      expenseFormValues.originalCurrency !== '' &&
      expenseFormValues.originalCurrency !== group.currencyCode

    const conversion = await resolveConversion({
      originalAmount: conversionRequired
        ? (expenseFormValues.originalAmount as number)
        : expenseFormValues.amount,
      originalCurrency: expenseFormValues.originalCurrency,
      groupCurrencyCode: group.currencyCode,
      expenseDate: expenseFormValues.expenseDate,
      clientConversionRate: expenseFormValues.conversionRate ?? undefined,
    })

    // Override form values with server-computed conversion data
    expenseFormValues.amount = conversion.amount
    expenseFormValues.originalAmount = conversion.originalAmount
    expenseFormValues.originalCurrency = conversion.originalCurrency
    expenseFormValues.conversionRate =
      conversion.conversionRate?.toNumber() ?? null

    const expense = await createExpense(expenseFormValues, groupId, userId)
    notifyOnActivity(groupId, ActivityType.CREATE_EXPENSE, {
      userId,
      expenseId: expense.id,
    })

    // Upsert category mapping (secondary operation - must not block expense creation)
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
  })
