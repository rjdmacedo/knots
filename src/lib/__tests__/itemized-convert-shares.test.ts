/**
 * Tests for convertSharesToGroupCurrency: re-deriving per-participant shares
 * from a server-converted total while keeping the sum exact.
 *
 * Feature: itemized-expenses
 *
 * **Validates: Requirements 11.3, 11.4, 11.6**
 */

import fc from 'fast-check'
import { convertAmount, getDecimalDigits } from '../currency-conversion'
import { convertSharesToGroupCurrency } from '../itemized-split'

describe('convertSharesToGroupCurrency', () => {
  it('returns shares that sum exactly to the converted total (worked example)', () => {
    // Entry_Currency shares (minor units): 3000, 1000, 600 → total 4600.
    // Convert EUR→USD at 1.10: total 4600 → 5060.
    const entryShares = [3000, 1000, 600]
    const entryTotalMinor = entryShares.reduce((s, w) => s + w, 0)
    const convertedTotalMinor = convertAmount(entryTotalMinor, 1.1, 2, 2)

    const result = convertSharesToGroupCurrency(
      convertedTotalMinor,
      entryShares,
      2,
    )

    expect(result.reduce((s, v) => s + v, 0)).toBe(convertedTotalMinor)
    // Largest weight gets the largest converted share.
    expect(result[0]).toBeGreaterThan(result[1])
    expect(result[1]).toBeGreaterThan(result[2])
  })

  it('stays exact converting into a zero-decimal currency (EUR→JPY)', () => {
    // EUR (2 digits) → JPY (0 digits) at ~160.
    const entryShares = [1234, 5678, 9012]
    const entryTotalMinor = entryShares.reduce((s, w) => s + w, 0)
    const groupDigits = getDecimalDigits('JPY') // 0
    const convertedTotalMinor = convertAmount(
      entryTotalMinor,
      160.25,
      2,
      groupDigits,
    )

    const result = convertSharesToGroupCurrency(
      convertedTotalMinor,
      entryShares,
      groupDigits,
    )

    expect(result.reduce((s, v) => s + v, 0)).toBe(convertedTotalMinor)
    for (const v of result) expect(Number.isInteger(v)).toBe(true)
  })

  it('handles a single participant (all of the converted total)', () => {
    const convertedTotalMinor = convertAmount(9999, 0.87, 2, 2)
    const result = convertSharesToGroupCurrency(convertedTotalMinor, [9999], 2)
    expect(result).toEqual([convertedTotalMinor])
  })

  it('returns an empty array for no participants', () => {
    expect(convertSharesToGroupCurrency(0, [], 2)).toEqual([])
  })

  it('property: converted shares always sum to the converted total', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.float({
          min: Math.fround(0.01),
          max: Math.fround(500),
          noNaN: true,
        }),
        fc.constantFrom(0, 2), // group currency decimal digits (JPY vs EUR/USD)
        (entryShares, rate, groupDigits) => {
          const entryTotalMinor = entryShares.reduce((s, w) => s + w, 0)
          const convertedTotalMinor = convertAmount(
            entryTotalMinor,
            rate,
            2,
            groupDigits,
          )
          const result = convertSharesToGroupCurrency(
            convertedTotalMinor,
            entryShares,
            groupDigits,
          )
          const sum = result.reduce((s, v) => s + v, 0)
          expect(sum).toBe(convertedTotalMinor)
        },
      ),
      { numRuns: 200 },
    )
  })
})
