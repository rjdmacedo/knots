import { Prisma } from '@prisma/client'
import { resolveConversion } from './resolve-conversion'

export interface ExistingExpenseData {
  originalAmount: number | null
  originalCurrency: string | null
  expenseDate: Date
  amount: number
  conversionRate: Prisma.Decimal | null
}

export interface UpdateConversionInput {
  /** The submitted amount in group currency minor units (preview when conversion active) */
  amount: number
  /** The original amount in original currency minor units (sent by client when conversion is active) */
  originalAmount: number | undefined
  originalCurrency: string | undefined | null
  expenseDate: Date
  conversionRate?: number
  groupCurrencyCode: string | null
  existingExpense: ExistingExpenseData
}

export interface UpdateConversionResult {
  amount: number
  originalAmount: number | null
  originalCurrency: string | null
  conversionRate: number | null
}

/**
 * Resolves conversion for an expense update.
 *
 * Decision logic:
 * 1. If originalCurrency is null/empty or equals groupCurrencyCode → passthrough (nullify conversion fields)
 * 2. If conversion needed but conversion-relevant fields (originalAmount, originalCurrency, expenseDate) haven't changed → retain existing data
 * 3. If conversion needed and fields changed → re-resolve conversion via fetchRate
 */
export async function resolveUpdateConversion(
  input: UpdateConversionInput,
): Promise<UpdateConversionResult> {
  const {
    amount,
    originalAmount,
    originalCurrency,
    expenseDate,
    conversionRate: clientConversionRate,
    groupCurrencyCode,
    existingExpense,
  } = input

  // Determine if conversion is needed
  const needsConversion =
    originalCurrency != null &&
    originalCurrency !== '' &&
    originalCurrency !== groupCurrencyCode

  if (!needsConversion) {
    // Same currency or no original currency — passthrough (null to clear DB fields)
    return {
      amount,
      originalAmount: null,
      originalCurrency: null,
      conversionRate: null,
    }
  }

  // The originalAmount from the client is the source of truth for change detection
  // (NOT `amount` which is a preview in group currency)
  const submittedOriginalAmount = originalAmount ?? amount

  // Check if conversion-relevant fields changed
  const conversionFieldsChanged =
    submittedOriginalAmount !== existingExpense.originalAmount ||
    originalCurrency !== existingExpense.originalCurrency ||
    expenseDate.getTime() !== existingExpense.expenseDate.getTime()

  if (!conversionFieldsChanged) {
    // Retain existing conversion data (no re-fetch needed)
    return {
      amount: existingExpense.amount,
      originalAmount: existingExpense.originalAmount,
      originalCurrency: existingExpense.originalCurrency,
      conversionRate: existingExpense.conversionRate?.toNumber() ?? null,
    }
  }

  // Re-resolve conversion with new values
  const conversion = await resolveConversion({
    originalAmount: submittedOriginalAmount,
    originalCurrency,
    groupCurrencyCode,
    expenseDate,
    clientConversionRate,
  })

  return {
    amount: conversion.amount,
    originalAmount: conversion.originalAmount,
    originalCurrency: conversion.originalCurrency,
    conversionRate: conversion.conversionRate?.toNumber() ?? null,
  }
}
