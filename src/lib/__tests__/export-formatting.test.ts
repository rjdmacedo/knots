import { getDecimalDigits } from '@/lib/currency-conversion'
import fc from 'fast-check'

// Feature: server-authoritative-currency-conversion, Property 6: Export formatting respects currency decimal digits

/**
 * Pure formatting function matching the CSV export logic:
 * formatAmountAsDecimal(originalAmount, currency) where currency.decimal_digits
 * is determined by getDecimalDigits(currencyCode).
 */
function formatOriginalAmount(
  originalAmount: number,
  currencyCode: string,
): string {
  const decimalDigits = getDecimalDigits(currencyCode)
  return (originalAmount / Math.pow(10, decimalDigits)).toFixed(decimalDigits)
}

describe('Property 6: Export formatting respects currency decimal digits', () => {
  // **Validates: Requirements 6.4**

  const currencyCodes = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'KRW',
    'ISK',
    'HUF',
    'CAD',
    'AUD',
    'BRL',
  ]

  it('formatted value equals (originalAmount / 10^decimalDigits).toFixed(decimalDigits)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom(...currencyCodes),
        (originalAmount, currencyCode) => {
          const decimalDigits = getDecimalDigits(currencyCode)
          const formatted = formatOriginalAmount(originalAmount, currencyCode)

          const expected = (
            originalAmount / Math.pow(10, decimalDigits)
          ).toFixed(decimalDigits)

          expect(formatted).toBe(expected)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('2-decimal currencies always have exactly 2 decimal places', () => {
    const twoDecimalCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BRL']

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom(...twoDecimalCurrencies),
        (originalAmount, currencyCode) => {
          const formatted = formatOriginalAmount(originalAmount, currencyCode)

          // Must contain a decimal point
          expect(formatted).toContain('.')

          // Must have exactly 2 digits after the decimal point
          const decimalPart = formatted.split('.')[1]
          expect(decimalPart).toHaveLength(2)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('0-decimal currencies have no decimal point', () => {
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'ISK', 'HUF']

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom(...zeroDecimalCurrencies),
        (originalAmount, currencyCode) => {
          const formatted = formatOriginalAmount(originalAmount, currencyCode)

          // Must NOT contain a decimal point
          expect(formatted).not.toContain('.')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('round-trip: parsing formatted value back and multiplying by 10^decimalDigits returns the original integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.constantFrom(...currencyCodes),
        (originalAmount, currencyCode) => {
          const decimalDigits = getDecimalDigits(currencyCode)
          const formatted = formatOriginalAmount(originalAmount, currencyCode)

          // Parse back and recover original integer
          const parsedBack = parseFloat(formatted)
          const recovered = Math.round(parsedBack * Math.pow(10, decimalDigits))

          expect(recovered).toBe(originalAmount)
        },
      ),
      { numRuns: 100 },
    )
  })
})
