import { isPaymentCategory } from '@/lib/categories'
import { RecurrenceRule, SplitMode } from '@prisma/client'
import * as z from 'zod'

/** Display percentages (33.33) or basis points (3333) → basis points. */
export function toPercentageBasisPoints(shares: number | string): number {
  const value = Number(shares)
  if (Number.isNaN(value)) return 0
  if (value > 100) return Math.round(value)
  return Math.round(value * 100)
}

/** Major-unit amounts (110.67) or minor units (11067) → minor units. */
export function toAmountMinorUnitsForValidation(
  value: number | string,
  decimalDigits = 2,
): number {
  const amount = Number(value)
  if (Number.isNaN(amount)) return 0

  const factor = 10 ** decimalDigits
  const raw = String(value)
  if (raw.includes('.') || raw.includes(',')) {
    return Math.round(amount * factor)
  }

  // Uneven splits are submitted as integer minor units (e.g. 11067).
  if (Number.isInteger(amount) && Math.abs(amount) >= factor * 10) {
    return Math.round(amount)
  }

  return Math.round(amount * factor)
}

export const groupFormSchema = z.object({
  name: z.string().min(2, 'min2').max(50, 'max50'),
  information: z.string().optional(),
  currency: z.string().min(1, 'min1').max(5, 'max5'),
  currencyCode: z.union([z.string().length(3).nullish(), z.literal('')]), // ISO-4217 currency code
  simplifyDebts: z.boolean().default(true),
})

export type GroupFormValues = z.infer<typeof groupFormSchema>

const inputCoercedToNumber = z.union([
  z.number(),
  z.string().transform((value, ctx) => {
    const valueAsNumber = Number(value)
    if (Number.isNaN(valueAsNumber))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalidNumber',
      })
    return valueAsNumber
  }),
])

export const expenseFormSchema = z
  .object({
    expenseDate: z.coerce.date(),
    title: z.string().default(''),
    category: z.coerce.number().default(0),
    amount: z
      .union(
        [
          z.number(),
          z.string().transform((value, ctx) => {
            const valueAsNumber = Number(value)
            if (Number.isNaN(valueAsNumber))
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'invalidNumber',
              })
            return valueAsNumber
          }),
        ],
        { required_error: 'amountRequired' },
      )
      .refine((amount) => amount != 0, 'amountNotZero')
      .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion'),
    originalAmount: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber
          .refine((amount) => amount != 0, 'amountNotZero')
          .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion'),
      ])
      .optional(),
    originalCurrency: z.union([z.string().length(3).nullish(), z.literal('')]),
    conversionRate: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber.refine((amount) => amount > 0, 'ratePositive'),
      ])
      .optional(),
    paidBy: z.string({ required_error: 'paidByRequired' }),
    paidFor: z
      .array(
        z.object({
          participant: z.string(),
          originalAmount: z.string().optional(), // For converting shares by amounts in original currency, not saved.
          shares: z.union([
            z.number(),
            z.string().transform((value, ctx) => {
              // Handle empty strings as invalid (not as 0)
              if (value.trim() === '') {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'noZeroShares',
                })
                return value
              }
              const normalizedValue = value.replace(/,/g, '.')
              const valueAsNumber = Number(normalizedValue)
              if (Number.isNaN(valueAsNumber))
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'invalidNumber',
                })
              return value
            }),
          ]),
        }),
      )
      .min(1, 'paidForMin1')
      .superRefine((paidFor, ctx) => {
        for (let i = 0; i < paidFor.length; i++) {
          const { shares } = paidFor[i]
          const shareNumber = Number(shares)
          if (Number.isNaN(shareNumber) || shareNumber <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'noZeroShares',
              path: ['paidFor', i, 'shares'],
            })
          }
        }
      }),
    splitMode: z
      .enum<
        SplitMode,
        [SplitMode, ...SplitMode[]]
      >(Object.values(SplitMode) as any)
      .default('EVENLY'),
    saveDefaultSplittingOptions: z.boolean(),
    isReimbursement: z.boolean(),
    documents: z
      .array(
        z.object({
          id: z.string(),
          url: z.string().url(),
          width: z.number().int().min(1),
          height: z.number().int().min(1),
        }),
      )
      .default([]),
    notes: z.string().optional(),
    recurrenceRule: z
      .enum<
        RecurrenceRule,
        [RecurrenceRule, ...RecurrenceRule[]]
      >(Object.values(RecurrenceRule) as any)
      .default('NONE'),
  })
  .superRefine((expense, ctx) => {
    if (!expense.isReimbursement && isPaymentCategory(expense.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paymentCategoryNotAllowed',
        path: ['category'],
      })
    }

    if (!expense.isReimbursement && expense.title.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min2',
        path: ['title'],
      })
    }

    switch (expense.splitMode) {
      case 'EVENLY':
        break // noop
      case 'BY_SHARES':
        break // noop
      case 'BY_AMOUNT': {
        const sumMinor = expense.paidFor.reduce(
          (sum, { shares }) => sum + toAmountMinorUnitsForValidation(shares),
          0,
        )
        const amountMinor = toAmountMinorUnitsForValidation(expense.amount)
        if (sumMinor !== amountMinor) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'amountSum',
            path: ['paidFor'],
          })
        }
        break
      }
      case 'BY_PERCENTAGE': {
        const sum = expense.paidFor.reduce(
          (sum, { shares }) => sum + toPercentageBasisPoints(shares),
          0,
        )
        if (sum !== 10000) {
          const detail =
            sum < 10000
              ? `${((10000 - sum) / 100).toFixed(0)}% missing`
              : `${((sum - 10000) / 100).toFixed(0)}% surplus`
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'percentageSum',
            path: ['paidFor'],
          })
        }
        break
      }
    }
  })
  .transform((expense) => {
    // Format the share split as a number (if from form submission)
    return {
      ...expense,
      paidFor: expense.paidFor.map((paidFor) => {
        const shares = paidFor.shares
        if (expense.splitMode === 'BY_PERCENTAGE') {
          return {
            ...paidFor,
            shares: toPercentageBasisPoints(shares),
          }
        }
        if (typeof shares === 'string' && expense.splitMode !== 'BY_AMOUNT') {
          // For splitting not by amount, preserve the previous behaviour of multiplying the share by 100
          return {
            ...paidFor,
            shares: Math.round(Number(shares) * 100),
          }
        }
        // Otherwise, no need as the number will have been formatted according to currency.
        return {
          ...paidFor,
          shares: Number(shares),
        }
      }),
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>

const paymentAmountSchema = z
  .union(
    [
      z.number(),
      z.string().transform((value, ctx) => {
        const valueAsNumber = Number(value)
        if (Number.isNaN(valueAsNumber))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'invalidNumber',
          })
        return valueAsNumber
      }),
    ],
    { required_error: 'amountRequired' },
  )
  .refine((amount) => amount > 0, 'amountNotZero')
  .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion')

export const paymentFormSchema = z
  .object({
    expenseDate: z.coerce.date(),
    amount: paymentAmountSchema,
    paidBy: z.string({ required_error: 'paidByRequired' }),
    paidTo: z.string({ required_error: 'paidToRequired' }),
    notes: z.string().optional(),
  })
  .superRefine((payment, ctx) => {
    if (payment.paidBy === payment.paidTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paidToDifferent',
        path: ['paidTo'],
      })
    }
  })

export type PaymentFormValues = z.infer<typeof paymentFormSchema>

export type SplittingOptions = {
  // Used for saving default splitting options in localStorage
  splitMode: SplitMode
  paidFor: ExpenseFormValues['paidFor'] | null
}
