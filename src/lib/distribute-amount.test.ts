import {
  distributeEqualAmounts,
  distributeWeightedAmounts,
} from '@/lib/distribute-amount'

describe('distributeEqualAmounts', () => {
  it('splits €100 across 3 with conserved cents', () => {
    const parts = distributeEqualAmounts(100, 3, 2)
    expect(parts).toEqual([33.34, 33.33, 33.33])
    expect(parts.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 10)
  })

  it('returns the full total for a single recipient', () => {
    expect(distributeEqualAmounts(21.5, 1, 2)).toEqual([21.5])
  })

  it('returns an empty array for count 0', () => {
    expect(distributeEqualAmounts(100, 0, 2)).toEqual([])
  })
})

describe('distributeWeightedAmounts', () => {
  it('splits by shares 1:1:1 like equal', () => {
    const parts = distributeWeightedAmounts(100, [1, 1, 1], 2)
    expect(parts.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 10)
    expect(parts.every((p) => p === 33.33 || p === 33.34)).toBe(true)
  })

  it('splits 1:2 for €90 → 30 and 60', () => {
    expect(distributeWeightedAmounts(90, [1, 2], 2)).toEqual([30, 60])
  })

  it('falls back to equal when all weights are zero', () => {
    expect(distributeWeightedAmounts(10, [0, 0], 2)).toEqual([5, 5])
  })
})

describe('single-payer full total', () => {
  it('emits one share equal to the expense total', () => {
    const total = 42.07
    expect(distributeEqualAmounts(total, 1, 2)).toEqual([total])
  })
})
