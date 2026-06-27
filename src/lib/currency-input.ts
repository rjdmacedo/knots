import { Currency } from '@/lib/currency'

export const enforceCurrencyPattern = (value: string) =>
  value
    .replace(/^\s*-/, '_')
    .replace(/[.,]/, '#')
    .replace(/[-.,]/g, '')
    .replace(/_/, '-')
    .replace(/#/, '.')
    .replace(/[^-\d.]/g, '')

export function getDecimalSeparator(locale: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1)
  return parts.find((part) => part.type === 'decimal')?.value ?? '.'
}

export function getCurrencyInputPlaceholder(
  locale: string,
  decimalDigits: number,
): string {
  const separator = getDecimalSeparator(locale)
  if (decimalDigits === 0) return '0'
  return `0${separator}${'0'.repeat(decimalDigits)}`
}

export function formatCurrencyInputValue(
  value: number | string | undefined | null,
  locale: string,
  decimalDigits: number,
): string {
  if (value === '' || value === undefined || value === null) return ''

  const numericValue =
    typeof value === 'number'
      ? value
      : Number(enforceCurrencyPattern(String(value)))

  if (Number.isNaN(numericValue)) return ''

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalDigits,
    useGrouping: false,
  }).format(numericValue)
}

export function valueToCurrencyDraft(
  value: number | string | undefined | null,
): string {
  if (value === '' || value === undefined || value === null) return ''
  return String(value)
}

export function getCurrencyDisplaySymbol(currency: Currency): string {
  return currency.symbol || currency.symbol_native || currency.code || '—'
}

export function formatObtainedExchangeRate(rate: number): string {
  return rate.toFixed(2)
}
