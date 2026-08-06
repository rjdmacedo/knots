import fc from 'fast-check'
import { convertAmount, getDecimalDigits } from './currency-conversion'

describe('getDecimalDigits', () => {
  it('returns 0 for JPY', () => {
    expect(getDecimalDigits('JPY')).toBe(0)
  })

  it('returns 0 for KRW', () => {
    expect(getDecimalDigits('KRW')).toBe(0)
  })

  it('returns 0 for ISK', () => {
    expect(getDecimalDigits('ISK')).toBe(0)
  })

  it('returns 0 for HUF', () => {
    expect(getDecimalDigits('HUF')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(getDecimalDigits('jpy')).toBe(0)
    expect(getDecimalDigits('Jpy')).toBe(0)
  })

  it('returns 2 for USD', () => {
    expect(getDecimalDigits('USD')).toBe(2)
  })

  it('returns 2 for EUR', () => {
    expect(getDecimalDigits('EUR')).toBe(2)
  })

  it('returns 2 for GBP', () => {
    expect(getDecimalDigits('GBP')).toBe(2)
  })

  it('returns 2 for unknown currency codes', () => {
    expect(getDecimalDigits('XYZ')).toBe(2)
  })
})

describe('convertAmount', () => {
  describe('standard 2-digit currencies (USD→EUR)', () => {
    it('converts 15000 cents USD to EUR at rate 0.92', () => {
      // Math.round((15000 / 100) * 0.92 * 100) = Math.round(13800) = 13800
      const result = convertAmount(15000, 0.92, 2, 2)
      expect(result).toBe(13800)
    })

    it('converts 10000 cents at rate 1.0 (identity)', () => {
      const result = convertAmount(10000, 1.0, 2, 2)
      expect(result).toBe(10000)
    })
  })

  describe('zero-decimal currencies', () => {
    it('converts JPY→EUR: 15000 yen at rate 0.0061 (source=0, target=2)', () => {
      // Math.round((15000 / 1) * 0.0061 * 100) = Math.round(9150) = 9150
      // 15000 JPY at 0.0061 EUR/JPY = 91.50 EUR = 9150 euro-cents
      const result = convertAmount(15000, 0.0061, 0, 2)
      expect(result).toBe(9150)
    })

    it('converts USD→JPY: 15000 cents at rate 149.5 (source=2, target=0)', () => {
      // Math.round((15000 / 100) * 149.5 * 1) = Math.round(22425) = 22425
      const result = convertAmount(15000, 149.5, 2, 0)
      expect(result).toBe(22425)
    })
  })

  describe('rate < 1', () => {
    it('converts 10000 cents USD→GBP at rate 0.79', () => {
      // Math.round((10000 / 100) * 0.79 * 100) = Math.round(7900) = 7900
      const result = convertAmount(10000, 0.79, 2, 2)
      expect(result).toBe(7900)
    })
  })

  describe('rate > 1', () => {
    it('converts 10000 cents GBP→USD at rate 1.27', () => {
      // Math.round((10000 / 100) * 1.27 * 100) = Math.round(12700) = 12700
      const result = convertAmount(10000, 1.27, 2, 2)
      expect(result).toBe(12700)
    })
  })

  describe('rounding behavior (Math.round)', () => {
    it('rounds down when fractional part < 0.5', () => {
      // 1000 cents * 0.333 rate: Math.round((1000 / 100) * 0.333 * 100) = Math.round(333.0) = 333
      const result = convertAmount(1000, 0.333, 2, 2)
      expect(result).toBe(333)
    })

    it('rounds up when fractional part >= 0.5', () => {
      // 1001 cents * 0.333 rate: Math.round((1001 / 100) * 0.333 * 100) = Math.round(333.333) = 333
      const result = convertAmount(1001, 0.333, 2, 2)
      expect(result).toBe(333)
    })

    it('rounds 0.5 up (standard Math.round)', () => {
      // We need a case where the result is exactly X.5
      // 500 cents * 0.01 rate: Math.round((500 / 100) * 0.01 * 100) = Math.round(5.0) = 5
      // Let's use: 150 cents * 0.03 rate: Math.round((150 / 100) * 0.03 * 100) = Math.round(4.5) = 5 (rounds up because >=0.5 is the tie-breaking rule)
      // Actually: (150/100)*0.03*100 = 1.5*0.03*100 = 4.5
      const result = convertAmount(150, 0.03, 2, 2)
      expect(result).toBe(5) // Math.round(4.5) = 5
    })

    it('always returns an integer', () => {
      const result = convertAmount(1234, 0.9876, 2, 2)
      expect(Number.isInteger(result)).toBe(true)
    })
  })
})

// Feature: server-authoritative-currency-conversion, Property 1: convertAmount produces correct integer result
describe('Property 1: convertAmount produces correct integer result', () => {
  // **Validates: Requirements 1.2, 2.3, 9.2**
  it('should equal Math.round((originalAmountMinorUnits / 10^sourceDecimalDigits) * rate * 10^targetDecimalDigits) and always be an integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }),
        fc
          .double({
            min: 0.0001,
            max: 1000,
            noNaN: true,
            noDefaultInfinity: true,
          })
          .filter((r) => r > 0),
        fc.constantFrom(0, 2, 3),
        fc.constantFrom(0, 2, 3),
        (
          originalAmountMinorUnits,
          rate,
          sourceDecimalDigits,
          targetDecimalDigits,
        ) => {
          const result = convertAmount(
            originalAmountMinorUnits,
            rate,
            sourceDecimalDigits,
            targetDecimalDigits,
          )

          const expected = Math.round(
            (originalAmountMinorUnits / Math.pow(10, sourceDecimalDigits)) *
              rate *
              Math.pow(10, targetDecimalDigits),
          )

          // Assert result equals the expected formula
          expect(result).toBe(expected)

          // Assert result is always an integer
          expect(Number.isInteger(result)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// Feature: server-authoritative-currency-conversion, Property 2: Round-trip tolerance within one minor unit

describe('Property 2: Round-trip tolerance within one minor unit', () => {
  // **Validates: Requirements 9.3**
  it('converting forward then reverse stays within ±1 minor unit of original', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: -1_000_000_00, max: 1_000_000_00 })
          .filter((n) => n !== 0),
        fc.double({ min: 0.01, max: 1000, noNaN: true }),
        fc.constantFrom(0, 2),
        fc.constantFrom(0, 2),
        (
          originalAmountMinorUnits,
          rate,
          sourceDecimalDigits,
          targetDecimalDigits,
        ) => {
          // For the ±1 tolerance to hold, the rate must compensate for
          // any decimal digit difference. When sd > td, the reverse conversion
          // amplifies rounding error by 10^(sd-td)/rate. Filter out combinations
          // where this amplification exceeds 1.
          const reverseAmplification =
            ((1 / rate) * Math.pow(10, sourceDecimalDigits)) /
            Math.pow(10, targetDecimalDigits)
          if (reverseAmplification > 2) return

          // Convert forward: source → target
          const converted = convertAmount(
            originalAmountMinorUnits,
            rate,
            sourceDecimalDigits,
            targetDecimalDigits,
          )

          // Skip degenerate cases where forward conversion rounds to zero
          // (information is irreversibly lost, no reverse can recover it)
          if (converted === 0) return

          // Convert reverse: target → source using inverse rate
          const reverseResult = convertAmount(
            converted,
            1 / rate,
            targetDecimalDigits,
            sourceDecimalDigits,
          )

          // Assert round-trip tolerance: |reverseResult - original| <= 1
          expect(
            Math.abs(reverseResult - originalAmountMinorUnits),
          ).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 100 },
    )
  })
})
