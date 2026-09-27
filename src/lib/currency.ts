import { Locale } from '@/i18n'
import currencyList from './currency-data.json'

export type Currency = {
  name: string
  symbol_native: string
  symbol: string
  code: string
  name_plural: string
  rounding: number
  decimal_digits: number
}

export const supportedCurrencyCodes = [
  'USD',
  'EUR',
  'JPY',
  'BGN',
  'CZK',
  'DKK',
  'GBP',
  'HUF',
  'PLN',
  'RON',
  'SEK',
  'CHF',
  'ISK',
  'NOK',
  'TRY',
  'AUD',
  'BRL',
  'CAD',
  'CNY',
  'HKD',
  'IDR',
  'ILS',
  'INR',
  'KRW',
  'MXN',
  'NZD',
  'PHP',
  'SGD',
  'THB',
  'ZAR',
] as const
export type supportedCurrencyCodeType = (typeof supportedCurrencyCodes)[number]

/** Stored currency for a user who has not chosen one. */
export const DEFAULT_USER_CURRENCY_CODE = 'USD'

export function defaultCurrencyList(
  locale: Locale = 'en-US',
  customChoice: string | null = null,
) {
  const currencies = customChoice
    ? [
        {
          name: customChoice,
          symbol_native: '',
          symbol: '',
          code: '',
          name_plural: customChoice,
          rounding: 0,
          decimal_digits: 2,
        },
      ]
    : []
  const allCurrencies = currencyList[locale]
  return currencies.concat(Object.values(allCurrencies))
}

export function getCurrency(
  currencyCode: string | undefined | null,
  locale: Locale = 'en-US',
  customChoice = 'Custom',
): Currency {
  const defaultCurrency = {
    name: customChoice,
    symbol_native: '',
    symbol: '',
    code: '',
    name_plural: customChoice,
    rounding: 0,
    decimal_digits: 2,
  }
  if (!currencyCode || currencyCode === '') return defaultCurrency
  const currencyListInLocale = currencyList[locale] ?? currencyList['en-US']
  return (
    currencyListInLocale[currencyCode as supportedCurrencyCodeType] ??
    defaultCurrency
  )
}

/**
 * ISO code and symbol for a new group. Uses the creator's preferred currency,
 * or USD when that preference is missing or not a known code.
 */
export function currencyForUser(preferredCurrency: string | null | undefined): {
  code: string
  symbol: string
} {
  const currency = getCurrency(preferredCurrency || DEFAULT_USER_CURRENCY_CODE)
  if (currency.code) {
    return { code: currency.code, symbol: currency.symbol }
  }
  const fallback = getCurrency(DEFAULT_USER_CURRENCY_CODE)
  return { code: fallback.code, symbol: fallback.symbol }
}

/**
 * Currency stored on a new group. A known ISO code supplies its own symbol.
 * An empty code is a custom currency and needs a symbol of 1–5 characters.
 */
export function resolveGroupCurrency(
  currencyCode: string,
  currencySymbol?: string | null,
): { code: string; symbol: string } | null {
  if (!currencyCode) {
    const symbol = currencySymbol?.trim() ?? ''
    if (symbol.length < 1 || symbol.length > 5) return null
    return { code: '', symbol }
  }
  if (currencyCode.length !== 3) return null
  const currency = getCurrency(currencyCode)
  if (!currency.code) return null
  return { code: currency.code, symbol: currency.symbol }
}
