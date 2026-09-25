import { getDecimalDigits } from '@/lib/currency-conversion'
import { convertSharesToGroupCurrency } from '@/lib/itemized-split'
import { ExpenseFormValues } from '@/lib/schemas'

/**
 * When an itemized expense is entered in a currency other than the group's, the
 * per-participant `paidFor` shares submitted by the form are in the Entry_Currency
 * (they were converted to minor units once, client-side, using the Entry_Currency
 * digits). After the server converts the *total* to the group currency, the shares
 * must be re-derived from that converted total so their sum stays exact.
 *
 * This mutates `expenseFormValues.paidFor` in place, replacing each share with a
 * group-currency minor-unit amount. It is a no-op when the expense is not itemized
 * or when no conversion happened (same-currency expenses keep their shares as-is).
 *
 * `convertedAmount` is the group-currency total in minor units (resolveConversion's
 * `amount`). `conversionHappened` is true when originalCurrency differs from the
 * group currency (i.e. resolveConversion actually converted).
 */
export function applyItemizedConversion(
  expenseFormValues: ExpenseFormValues,
  convertedAmount: number,
  conversionHappened: boolean,
  groupCurrencyCode: string | null,
): void {
  if (!expenseFormValues.itemization?.authoritative) return
  if (!conversionHappened || !groupCurrencyCode) return

  const weights = expenseFormValues.paidFor.map((pf) => Number(pf.shares))
  const groupDigits = getDecimalDigits(groupCurrencyCode)

  const convertedShares = convertSharesToGroupCurrency(
    convertedAmount,
    weights,
    groupDigits,
  )

  expenseFormValues.paidFor = expenseFormValues.paidFor.map((pf, i) => ({
    ...pf,
    shares: convertedShares[i],
  }))
}
