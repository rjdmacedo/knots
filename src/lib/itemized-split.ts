/**
 * Pure computation for itemized expenses (v1.1).
 *
 * Splits line items across the participants assigned to each item, then
 * distributes a single signed "Other" remainder (tax / tip / service, or a
 * negative discount) across participants — either PROPORTIONAL to each
 * participant's item subtotal, or by a CUSTOM flat split. Everything is computed
 * in integer **minor units** (e.g. cents) end to end so no cent is lost or
 * invented.
 *
 * The remainder policies mirror `src/lib/distribute-amount.ts` and are applied
 * inline in minor units here (those helpers take a major-unit total and return
 * major-unit values, so they are not called directly in this module except in
 * `convertSharesToGroupCurrency`):
 *   - Equal split of a single shared item / EVENLY remainder: leftover minor
 *     units go to the earliest participants in `participantIdsInOrder` (the
 *     `distributeEqualAmounts` policy).
 *   - PROPORTIONAL / BY_SHARES / BY_PERCENTAGE remainder: leftover minor units go
 *     to the largest fractional parts first, ties broken by earlier position
 *     (the `distributeWeightedAmounts` policy).
 *   - BY_AMOUNT remainder: the shares are the minor-unit amounts directly.
 *
 * Signed amounts: the remainder may be negative. All distributors here handle a
 * negative total by distributing its magnitude and negating, so the exactness
 * guarantee holds for refunds/discounts as well as positive charges.
 *
 * Invariant: sum(perParticipant.amountMinor) === totalMinor, always
 * (totalMinor = Σ item amounts + remainder, signed).
 */

import { distributeWeightedAmounts } from '@/lib/distribute-amount'
import { SplitMode } from '@prisma/client'

export interface ItemizedItem {
  /** Item_Amount in minor units, in the currency the expense was entered in. */
  amountMinor: number
  /** Participant IDs this item is assigned to (one or more). */
  assignedParticipantIds: string[]
}

/**
 * The "Other" remainder pool: `Expense_Total − Σ Item_Amount`, signed, in minor
 * units. `allocationMode` decides how it is spread across participants.
 * `splitMode` + `paidFor` are used only for CUSTOM.
 */
export interface ItemizedRemainder {
  amountMinor: number
  allocationMode: 'PROPORTIONAL' | 'CUSTOM'
  /** CUSTOM only: the flat split mode of the "Other" line. */
  splitMode?: SplitMode
  /** CUSTOM only: per-participant rows; `shares` meaning follows `splitMode`. */
  paidFor?: Array<{ participantId: string; shares: number }>
}

export interface ItemizedInput {
  /**
   * All participants in `paidFor` order. Defines both the output order and the
   * deterministic recipients of remainder minor units.
   */
  participantIdsInOrder: string[]
  items: ItemizedItem[]
  remainder: ItemizedRemainder
}

export interface ItemizedResult {
  /** One entry per participant, in `participantIdsInOrder` order; minor units. */
  perParticipant: Array<{ participantId: string; amountMinor: number }>
  /** Σ item amounts + remainder, in minor units (signed). */
  totalMinor: number
}

/**
 * Split `amountMinor` equally across `k` recipients (given by their index into
 * the ordered participant list). Leftover minor units go to the earliest
 * indices. Returns a map of participantIndex → allocated minor units.
 * Handles negative amounts by splitting the magnitude and negating.
 */
function splitEquallyByIndices(
  amountMinor: number,
  assignedIndices: number[],
): Map<number, number> {
  const result = new Map<number, number>()
  const k = assignedIndices.length
  if (k === 0) return result

  const sign = amountMinor < 0 ? -1 : 1
  const magnitude = Math.abs(amountMinor)
  const base = Math.floor(magnitude / k)
  const remainder = magnitude - base * k

  assignedIndices.forEach((participantIndex, i) => {
    const minor = base + (i < remainder ? 1 : 0)
    result.set(participantIndex, sign * minor)
  })
  return result
}

/**
 * Distribute `chargeMinor` (signed) across participants in proportion to
 * `weights` (non-negative). Leftover minor units go to the largest fractional
 * parts first, ties broken by earlier index. Returns an array aligned to
 * `weights`, summing exactly to `chargeMinor`.
 *
 * When the total weight is zero, splits equally (earliest-index remainder).
 */
function distributeByWeights(chargeMinor: number, weights: number[]): number[] {
  const count = weights.length
  if (count === 0 || chargeMinor === 0) {
    return new Array(count).fill(0)
  }

  const sign = chargeMinor < 0 ? -1 : 1
  const magnitude = Math.abs(chargeMinor)
  const safeWeights = weights.map((w) => (w > 0 ? w : 0))
  const weightSum = safeWeights.reduce((sum, w) => sum + w, 0)

  // Zero total weight: split the magnitude equally (earliest-index remainder).
  if (weightSum <= 0) {
    const base = Math.floor(magnitude / count)
    const rem = magnitude - base * count
    return Array.from(
      { length: count },
      (_, i) => sign * (i < rem ? base + 1 : base),
    )
  }

  const raw = safeWeights.map((w) => (magnitude * w) / weightSum)
  const floored = raw.map((r) => Math.floor(r))
  let leftover = magnitude - floored.reduce((sum, f) => sum + f, 0)

  // Largest fractional part first; ties broken by earlier index (stable).
  const order = raw
    .map((r, i) => ({ i, frac: r - floored[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  const result = [...floored]
  for (const { i } of order) {
    if (leftover <= 0) break
    result[i] += 1
    leftover -= 1
  }
  return result.map((m) => sign * m)
}

/**
 * Distribute the CUSTOM remainder across the ordered participants using the
 * "Other" line's flat split (`splitMode` + `paidFor`), in minor units, aligned
 * to `participantIdsInOrder`. Participants not in `paidFor` receive 0.
 *
 * - EVENLY: equal split across the paidFor participants (earliest-index remainder).
 * - BY_SHARES / BY_PERCENTAGE: weighted by `shares` (largest-fraction remainder).
 * - BY_AMOUNT: `shares` are the minor-unit amounts directly (they are trusted to
 *   sum to `amountMinor`; the caller/validation guarantees this).
 */
function distributeCustomRemainder(
  amountMinor: number,
  splitMode: SplitMode,
  paidFor: Array<{ participantId: string; shares: number }>,
  indexById: Map<string, number>,
  n: number,
): number[] {
  const out = new Array<number>(n).fill(0)
  if (paidFor.length === 0 || amountMinor === 0) return out

  // Rows mapped to participant indices, preserving paidFor order for EVENLY
  // earliest-index remainder.
  const rows = paidFor
    .map((r) => ({ idx: indexById.get(r.participantId), shares: r.shares }))
    .filter((r): r is { idx: number; shares: number } => r.idx !== undefined)

  if (rows.length === 0) return out

  if (splitMode === 'BY_AMOUNT') {
    // shares are minor-unit amounts directly.
    for (const r of rows) out[r.idx] = Math.round(r.shares)
    return out
  }

  if (splitMode === 'EVENLY') {
    const equalWeights = rows.map(() => 1)
    const slices = distributeByWeights(amountMinor, equalWeights)
    rows.forEach((r, i) => {
      out[r.idx] = slices[i]
    })
    return out
  }

  // BY_SHARES / BY_PERCENTAGE: weighted by shares.
  const weights = rows.map((r) => (r.shares > 0 ? r.shares : 0))
  const slices = distributeByWeights(amountMinor, weights)
  rows.forEach((r, i) => {
    out[r.idx] = slices[i]
  })
  return out
}

export function computeItemizedShares(input: ItemizedInput): ItemizedResult {
  const { participantIdsInOrder, items, remainder } = input
  const n = participantIdsInOrder.length

  const indexById = new Map<string, number>()
  participantIdsInOrder.forEach((id, i) => indexById.set(id, i))

  // Steps 1 & 2: per-item equal split accumulated into per-participant subtotals.
  const subtotals = new Array<number>(n).fill(0)
  for (const item of items) {
    const assignedIndices = item.assignedParticipantIds
      .map((id) => indexById.get(id))
      .filter((idx): idx is number => idx !== undefined)
      // Ascending paidFor order so remainder goes to earliest participants.
      .sort((a, b) => a - b)

    const allocation = splitEquallyByIndices(item.amountMinor, assignedIndices)
    allocation.forEach((minor, participantIndex) => {
      subtotals[participantIndex] += minor
    })
  }

  // Step 3: distribute the remainder across participants.
  let remainderSlices: number[]

  if (remainder.allocationMode === 'CUSTOM') {
    remainderSlices = distributeCustomRemainder(
      remainder.amountMinor,
      remainder.splitMode ?? 'EVENLY',
      remainder.paidFor ?? [],
      indexById,
      n,
    )
  } else {
    // PROPORTIONAL: weight by item subtotals. If every subtotal is zero, fall
    // back to an equal split across the participants assigned to any item (or
    // all participants if no item has an assignment) so the charge still has a
    // home and the total stays exact.
    const subtotalSum = subtotals.reduce((sum, s) => sum + s, 0)
    if (subtotalSum !== 0) {
      remainderSlices = distributeByWeights(remainder.amountMinor, subtotals)
    } else {
      const assignedIndexSet = new Set<number>()
      for (const item of items) {
        for (const id of item.assignedParticipantIds) {
          const idx = indexById.get(id)
          if (idx !== undefined) assignedIndexSet.add(idx)
        }
      }
      const assignedIndices =
        assignedIndexSet.size > 0
          ? Array.from(assignedIndexSet).sort((a, b) => a - b)
          : participantIdsInOrder.map((_, i) => i)
      const equalWeights = assignedIndices.map(() => 1)
      const among = distributeByWeights(remainder.amountMinor, equalWeights)
      remainderSlices = new Array<number>(n).fill(0)
      assignedIndices.forEach((participantIndex, i) => {
        remainderSlices[participantIndex] = among[i]
      })
    }
  }

  // Step 4: Participant_Share = item subtotal + remainder slice.
  const perParticipant = participantIdsInOrder.map((participantId, i) => ({
    participantId,
    amountMinor: subtotals[i] + remainderSlices[i],
  }))

  const itemsSum = items.reduce((sum, item) => sum + item.amountMinor, 0)
  const totalMinor = itemsSum + remainder.amountMinor

  // Defensive invariant check: the split must be cent-exact (Requirement 5.1,
  // 16.5). For a BY_AMOUNT CUSTOM remainder the rows must already sum to the
  // remainder (enforced by the schema layer); if they do not, this throws
  // rather than silently persisting an inexact split.
  const shareSum = perParticipant.reduce((sum, p) => sum + p.amountMinor, 0)
  if (shareSum !== totalMinor) {
    throw new Error(
      `computeItemizedShares invariant violated: shares sum to ${shareSum} but total is ${totalMinor}`,
    )
  }

  return { perParticipant, totalMinor }
}

/**
 * Re-derive per-participant Group_Currency shares from a server-converted total,
 * keeping the sum exact.
 *
 * Used only when the expense was entered in a currency other than the group's:
 * the server (resolveConversion) converts the *total* to the group currency, and
 * this helper distributes that converted total across participants by their
 * pre-conversion (Entry_Currency) shares as weights. Because the total is
 * distributed by weights with a deterministic remainder, the returned amounts
 * sum exactly to `convertedTotalMinor` — no cent is lost or gained through
 * per-participant rounding.
 *
 * Units note: `distributeWeightedAmounts` takes a MAJOR-unit total and returns
 * MAJOR-unit values, so we pass `convertedTotalMinor / factor` in and multiply
 * each result back to minor units on the way out.
 *
 * @param convertedTotalMinor - group-currency total in minor units (from resolveConversion)
 * @param preConversionShareWeights - each participant's Entry_Currency share (minor units) used as a weight
 * @param groupDigits - group currency decimal digits (getDecimalDigits(groupCurrencyCode))
 * @returns group-currency per-participant amounts in minor units, summing to convertedTotalMinor
 */
export function convertSharesToGroupCurrency(
  convertedTotalMinor: number,
  preConversionShareWeights: number[],
  groupDigits: number,
): number[] {
  const count = preConversionShareWeights.length
  if (count === 0) return []

  const factor = 10 ** groupDigits
  const convertedSharesMajor = distributeWeightedAmounts(
    convertedTotalMinor / factor, // major-unit total the helper expects
    preConversionShareWeights,
    groupDigits,
  ) // returns MAJOR units (minor / factor)

  return convertedSharesMajor.map((m) => Math.round(m * factor))
}

/**
 * Whether item subtotals overshoot the expense total in the expense's sign
 * direction. Positive expenses use `items > total`; negative expenses (refunds)
 * use the mirrored `items < total`, so a signed "Other" remainder can still
 * account for the unitemized part.
 */
export function itemsExceedExpenseAmount(
  itemsSumMinor: number,
  expenseTotalMinor: number,
): boolean {
  return expenseTotalMinor < 0
    ? itemsSumMinor < expenseTotalMinor
    : itemsSumMinor > expenseTotalMinor
}
