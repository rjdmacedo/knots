import { isPaymentCategory } from '@/lib/categories'
import { evaluate, isExpression } from '@/lib/math-expression'
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

/** Evaluate expression strings or parse plain numbers for amount fields. */
function expressionToNumber(value: string, ctx: z.RefinementCtx): number {
  // Fast path: plain number (no operators)
  if (!isExpression(value)) {
    const num = Number(value)
    if (Number.isNaN(num)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'invalidNumber',
      })
      return 0
    }
    return num
  }

  // Expression path
  const result = evaluate(value)
  if (!result.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'invalidExpression',
    })
    return 0
  }
  return result.value
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

export const paidByEntrySchema = z.object({
  participant: z.string().min(1),
  amount: z
    .union([z.number(), z.string().transform(expressionToNumber)])
    .refine((a) => a > 0, 'paidByAmountPositive'),
})

export const expenseFormSchema = z
  .object({
    expenseDate: z.coerce.date(),
    title: z.string().default(''),
    category: z.coerce.number().default(0),
    amount: z
      .union([z.number(), z.string().transform(expressionToNumber)], {
        required_error: 'amountRequired',
      })
      .refine((amount) => amount != 0, 'amountNotZero')
      .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion'),
    originalAmount: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber
          .refine((amount) => amount != 0, 'amountNotZero')
          .refine((amount) => amount <= 10_000_000_00, 'amountTenMillion'),
      ])
      .nullish(),
    originalCurrency: z.union([z.string().length(3).nullish(), z.literal('')]),
    conversionRate: z
      .union([
        z.literal('').transform(() => undefined),
        inputCoercedToNumber.refine((amount) => amount > 0, 'ratePositive'),
      ])
      .nullish(),
    paidBy: z.array(paidByEntrySchema).min(1, 'paidByRequired'),
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
    saveDefaultPaidByOptions: z.boolean(),
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
    // Optional itemization (v1.1). Items may exist as documentation while a
    // legacy split is active (authoritative = false), or drive the split
    // (authoritative = true → the form derives the BY_AMOUNT paidFor from the
    // items + the "Other" remainder). The remainder generalises tax/tip into one
    // signed pool, allocated PROPORTIONAL (to item subtotals) or CUSTOM (a flat
    // split). Item/remainder amounts are entered like the main amount (major
    // units, math expressions); they are converted to minor units once, in the
    // form's proceedWithSubmit — NOT here.
    itemization: z
      .object({
        authoritative: z.boolean(),
        items: z
          .array(
            z.object({
              title: z.string().min(1, 'itemTitleRequired'),
              // Per-unit price (Requirement 14). When omitted (e.g. older
              // payloads / receipt prefill), falls back to `amount` below.
              unitPrice: z
                .union([z.number(), z.string().transform(expressionToNumber)])
                .refine((a) => a >= 0, 'itemAmountNonNegative')
                .optional(),
              // Positive integer count; defaults to 1 (Requirement 14).
              quantity: z.coerce
                .number()
                .int('itemQuantityPositive')
                .min(1, 'itemQuantityPositive')
                .default(1),
              // Line total (unitPrice × quantity). Kept so the splitter and
              // legacy callers can read Item_Amount directly; the editor keeps
              // it in sync with unitPrice × quantity.
              amount: z
                .union([z.number(), z.string().transform(expressionToNumber)])
                .refine((a) => a >= 0, 'itemAmountNonNegative'),
              assignedParticipants: z
                .array(z.string())
                .min(1, 'itemNeedsAssignment'),
            })
            .transform((item) => {
              const quantity = item.quantity ?? 1
              const unitPrice = item.unitPrice ?? item.amount
              return { ...item, quantity, unitPrice }
            }),
          )
          .default([]),
        remainder: z
          .object({
            // Usually derived as (total − Σ items); the form supplies it.
            // May be negative (discount). Optional; defaults to 0.
            amount: z
              .union([z.number(), z.string().transform(expressionToNumber)])
              .optional(),
            allocationMode: z
              .enum(['PROPORTIONAL', 'CUSTOM'])
              .default('PROPORTIONAL'),
            // CUSTOM only: the flat split mode of the "Other" line.
            splitMode: z
              .enum<SplitMode, [SplitMode, ...SplitMode[]]>(
                Object.values(SplitMode) as any,
              )
              .optional(),
            // CUSTOM only: per-participant rows for the "Other" line.
            paidFor: z
              .array(
                z.object({
                  participant: z.string(),
                  shares: z.union([z.number(), z.string()]),
                }),
              )
              .optional(),
          })
          .default({ allocationMode: 'PROPORTIONAL' }),
      })
      .optional(),
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

    // Reimbursements must have exactly one payer
    if (expense.isReimbursement && expense.paidBy.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reimbursementSinglePayer',
        path: ['paidBy'],
      })
    }

    // No duplicate payer participants
    const payerIds = expense.paidBy.map((entry) => entry.participant)
    if (new Set(payerIds).size !== payerIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paidByDuplicateParticipants',
        path: ['paidBy'],
      })
    }

    // Sum of payer amounts must equal expense amount
    const payerSum = expense.paidBy.reduce(
      (sum, entry) => sum + entry.amount,
      0,
    )
    const amountMinor = toAmountMinorUnitsForValidation(expense.amount)
    const payerSumMinor = toAmountMinorUnitsForValidation(payerSum)
    if (payerSumMinor !== amountMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'paidByAmountSum',
        path: ['paidBy'],
      })
    }

    switch (expense.splitMode) {
      case 'EVENLY':
        break // noop
      case 'BY_SHARES':
        break // noop
      case 'BY_AMOUNT': {
        // Authoritative itemization derives the BY_AMOUNT paidFor from the pure
        // splitter (cent-exact by construction against its own Entry_Total), and
        // under FX the per-participant shares sum to the Entry_Total
        // (originalAmount), not the converted group `amount` — the server
        // re-derives group-currency shares from the converted total
        // (Requirement 18.4). So the legacy sum-to-`amount` check does not apply
        // to authoritative itemized expenses; the splitter + server guarantee
        // exactness instead.
        if (expense.itemization?.authoritative) break
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

    // Itemized validation (Requirements 8, 1.8, 16, 17). "Itemized" is read from
    // the authoritative flag, never from item presence. Documentation items
    // (authoritative = false) are not validated as a split.
    if (expense.itemization?.authoritative) {
      // Authoritative itemization is unavailable for reimbursements and recurring
      // expenses (Requirement 1.8).
      if (expense.isReimbursement || expense.recurrenceRule !== 'NONE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemizationNotAllowedHere',
          path: ['itemization'],
        })
      }

      const items = expense.itemization.items
      // At least one item is required when authoritative (Requirement 8.4).
      if (items.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemsRequired',
          path: ['itemization', 'items'],
        })
      }

      // Every item must be assigned only to current paidFor participants
      // (Requirement 8.1 via field-level min(1); 8.5 checked here).
      const participantIds = new Set(
        expense.paidFor.map((pf) => pf.participant),
      )
      items.forEach((item, i) => {
        for (const id of item.assignedParticipants) {
          if (!participantIds.has(id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'itemAssignmentUnknownParticipant',
              path: ['itemization', 'items', i, 'assignedParticipants'],
            })
            break
          }
        }
      })

      // Items must not overshoot the expense total in its sign direction
      // (Requirement 17.2). Compare in minor units.
      const amountMinor = toAmountMinorUnitsForValidation(expense.amount)
      const itemsSumMinor = items.reduce(
        (sum, item) => sum + toAmountMinorUnitsForValidation(item.amount),
        0,
      )
      const overshoot =
        amountMinor < 0
          ? itemsSumMinor < amountMinor
          : itemsSumMinor > amountMinor
      if (overshoot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemsExceedAmount',
          path: ['itemization', 'items'],
        })
      }

      // CUSTOM remainder rows must reference current participants (Requirement 16.4).
      const remainder = expense.itemization.remainder
      if (remainder.allocationMode === 'CUSTOM') {
        for (const row of remainder.paidFor ?? []) {
          if (!participantIds.has(row.participant)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'remainderShareUnknownParticipant',
              path: ['itemization', 'remainder', 'paidFor'],
            })
            break
          }
        }
      }
    }
  })
  .transform((expense) => {
    // When itemized, the form has already written the per-participant amounts
    // into paidFor as BY_AMOUNT shares (still in major units — the single
    // minor-unit conversion happens in proceedWithSubmit, not here). The
    // transform's only itemized job is to force splitMode to BY_AMOUNT and drop
    // participants whose computed share is zero (they leave paidFor). It must
    // NOT convert shares to minor units.
    const itemized = expense.itemization?.authoritative === true
    const effectiveSplitMode: SplitMode = itemized
      ? 'BY_AMOUNT'
      : expense.splitMode

    const mappedPaidFor = expense.paidFor.map((paidFor) => {
      const shares = paidFor.shares
      if (effectiveSplitMode === 'BY_PERCENTAGE') {
        return {
          ...paidFor,
          shares: toPercentageBasisPoints(shares),
        }
      }
      if (typeof shares === 'string' && effectiveSplitMode !== 'BY_AMOUNT') {
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
    })

    return {
      ...expense,
      splitMode: effectiveSplitMode,
      paidFor: itemized
        ? // Drop zero-share participants: they consumed nothing (Requirement 5.5).
          mappedPaidFor.filter((pf) => pf.shares > 0)
        : mappedPaidFor,
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>

const paymentAmountSchema = z
  .union([z.number(), z.string().transform(expressionToNumber)], {
    required_error: 'amountRequired',
  })
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

export type PaidByOptions = {
  // Used for saving default paid-by participants in localStorage
  payers: string[]
}
