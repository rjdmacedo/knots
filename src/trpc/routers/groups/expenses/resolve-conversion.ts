import {
  convertAmount,
  fetchRate,
  getDecimalDigits,
} from '@/lib/currency-conversion'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'

interface ResolveConversionInput {
  originalAmount: number
  originalCurrency: string | undefined | null
  groupCurrencyCode: string | null
  expenseDate: Date
  clientConversionRate?: number
}

interface ResolveConversionResult {
  amount: number
  originalAmount: number | null
  originalCurrency: string | null
  conversionRate: Prisma.Decimal | null
}

/**
 * Resolves currency conversion for an expense.
 *
 * Decision logic:
 * 1. If originalCurrency is null/empty or equals groupCurrencyCode → passthrough
 * 2. Otherwise fetch rate from Frankfurter API
 * 3. If fetch succeeds → use returned rate
 * 4. If fetch fails and clientConversionRate provided → use it as fallback
 * 5. If fetch fails and no client rate → throw PRECONDITION_FAILED
 */
export async function resolveConversion(
  input: ResolveConversionInput,
): Promise<ResolveConversionResult> {
  const {
    originalAmount,
    originalCurrency,
    groupCurrencyCode,
    expenseDate,
    clientConversionRate,
  } = input

  // Passthrough: no conversion needed
  if (
    !originalCurrency ||
    !groupCurrencyCode ||
    originalCurrency === groupCurrencyCode
  ) {
    return {
      amount: originalAmount,
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    }
  }

  // Format date as YYYY-MM-DD for Frankfurter API
  const dateStr = expenseDate.toISOString().split('T')[0]

  // Attempt to fetch rate from Frankfurter API
  const rateResult = await fetchRate(
    originalCurrency,
    groupCurrencyCode,
    dateStr,
  )

  let rate: number

  if (rateResult.ok) {
    rate = rateResult.rate
  } else if (clientConversionRate != null) {
    rate = clientConversionRate
  } else {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Exchange rate unavailable. Please provide a manual rate.',
    })
  }

  // Compute converted amount using decimal digits for both currencies
  const sourceDecimalDigits = getDecimalDigits(originalCurrency)
  const targetDecimalDigits = getDecimalDigits(groupCurrencyCode)
  const convertedAmount = convertAmount(
    originalAmount,
    rate,
    sourceDecimalDigits,
    targetDecimalDigits,
  )

  return {
    amount: convertedAmount,
    originalAmount: input.originalAmount,
    originalCurrency: originalCurrency,
    conversionRate: new Prisma.Decimal(rate),
  }
}
