/**
 * Digit-aware distribution of a monetary total across N recipients.
 * Works in major units (e.g. euros) using integer minor-unit arithmetic
 * so remainders are not lost to floating-point / Math.floor on majors.
 */

export function distributeEqualAmounts(
  totalMajor: number,
  count: number,
  decimalDigits: number,
): number[] {
  if (count <= 0) return []
  const factor = 10 ** decimalDigits
  const totalMinor = Math.round(totalMajor * factor)
  if (count === 1) return [totalMinor / factor]

  const baseMinor = Math.floor(totalMinor / count)
  const remainder = totalMinor - baseMinor * count

  return Array.from({ length: count }, (_, index) => {
    const minor = baseMinor + (index < remainder ? 1 : 0)
    return minor / factor
  })
}

/**
 * Distribute `totalMajor` proportionally to non-negative `weights`.
 * Zero total weight → equal split. Remainder cents go to earliest indices.
 */
export function distributeWeightedAmounts(
  totalMajor: number,
  weights: number[],
  decimalDigits: number,
): number[] {
  const count = weights.length
  if (count === 0) return []

  const safeWeights = weights.map((w) => (w > 0 ? w : 0))
  const weightSum = safeWeights.reduce((sum, w) => sum + w, 0)
  if (weightSum <= 0) {
    return distributeEqualAmounts(totalMajor, count, decimalDigits)
  }

  const factor = 10 ** decimalDigits
  const totalMinor = Math.round(totalMajor * factor)

  const rawMinors = safeWeights.map((w) => (totalMinor * w) / weightSum)
  const floored = rawMinors.map((m) => Math.floor(m))
  let remainder = totalMinor - floored.reduce((sum, m) => sum + m, 0)

  // Give leftover cents to entries with the largest fractional parts first
  const order = rawMinors
    .map((m, i) => ({ i, frac: m - floored[i] }))
    .sort((a, b) => b.frac - a.frac)

  const minors = [...floored]
  for (const { i } of order) {
    if (remainder <= 0) break
    minors[i] += 1
    remainder -= 1
  }

  return minors.map((m) => m / factor)
}
