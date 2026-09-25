/**
 * Property-based tests for computeItemizedShares (itemized splitter, v1.1).
 *
 * Feature: itemized-expenses
 * Uses fast-check with a minimum of 100 iterations.
 *
 * **Validates: Requirements 3.3, 5.1, 5.3, 16.3, 16.4, 16.5**
 */

import fc from 'fast-check'
import {
  computeItemizedShares,
  ItemizedInput,
  ItemizedItem,
  ItemizedRemainder,
} from '../itemized-split'

const PBT_NUM_RUNS = 100

function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `user-${i}`)
}

/**
 * Generate a valid ItemizedInput with a PROPORTIONAL or CUSTOM (non-BY_AMOUNT)
 * remainder. The remainder amount may be negative (discount). BY_AMOUNT CUSTOM
 * is exercised separately in the unit tests because its rows must sum to the
 * remainder by construction.
 */
const arbInput: fc.Arbitrary<ItemizedInput> = fc
  .integer({ min: 1, max: 5 })
  .chain((participantCount) => {
    const ids = makeIds(participantCount)

    const arbItem: fc.Arbitrary<ItemizedItem> = fc.record({
      amountMinor: fc.integer({ min: 0, max: 500_000 }),
      assignedParticipantIds: fc
        .subarray(ids, { minLength: 1, maxLength: participantCount })
        .map((sub) => (sub.length > 0 ? sub : [ids[0]])),
    })

    const arbProportional: fc.Arbitrary<ItemizedRemainder> = fc
      .integer({ min: -100_000, max: 100_000 })
      .map((amountMinor) => ({
        amountMinor,
        allocationMode: 'PROPORTIONAL' as const,
      }))

    const arbCustom: fc.Arbitrary<ItemizedRemainder> = fc
      .tuple(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.constantFrom<'EVENLY' | 'BY_SHARES' | 'BY_PERCENTAGE'>(
          'EVENLY',
          'BY_SHARES',
          'BY_PERCENTAGE',
        ),
        fc
          .subarray(ids, { minLength: 1, maxLength: participantCount })
          .map((sub) => (sub.length > 0 ? sub : [ids[0]])),
      )
      .map(([amountMinor, splitMode, chosen]) => ({
        amountMinor,
        allocationMode: 'CUSTOM' as const,
        splitMode,
        paidFor: chosen.map((id) => ({ participantId: id, shares: 2 })),
      }))

    return fc.record({
      participantIdsInOrder: fc.constant(ids),
      items: fc.array(arbItem, { minLength: 0, maxLength: 8 }),
      remainder: fc.oneof(arbProportional, arbCustom),
    })
  })

describe('Property 1: cent-exactness', () => {
  it('shares always sum exactly to the total (items + remainder, signed)', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const result = computeItemizedShares(input)
        const sum = result.perParticipant.reduce((s, p) => s + p.amountMinor, 0)
        expect(sum).toBe(result.totalMinor)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('totalMinor equals sum(items) + remainder', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const result = computeItemizedShares(input)
        const itemsSum = input.items.reduce((s, i) => s + i.amountMinor, 0)
        expect(result.totalMinor).toBe(itemsSum + input.remainder.amountMinor)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

describe('Property 2: each shared item splits exactly (Requirement 3.3)', () => {
  it('the equal split of any single item sums to its amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 8 }),
        (amountMinor, k) => {
          const ids = makeIds(k)
          const result = computeItemizedShares({
            participantIdsInOrder: ids,
            items: [{ amountMinor, assignedParticipantIds: ids }],
            remainder: { amountMinor: 0, allocationMode: 'PROPORTIONAL' },
          })
          const sum = result.perParticipant.reduce(
            (s, p) => s + p.amountMinor,
            0,
          )
          expect(sum).toBe(amountMinor)
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

describe('Property 3: the remainder slice sums to the remainder (Requirements 16.3, 16.4, 16.5)', () => {
  it('remainder pool = (with-remainder shares) − (subtotal-only shares)', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const withRemainder = computeItemizedShares(input)
        const subtotalOnly = computeItemizedShares({
          ...input,
          remainder: { amountMinor: 0, allocationMode: 'PROPORTIONAL' },
        })
        const pool = withRemainder.perParticipant.reduce(
          (s, p, i) =>
            s + (p.amountMinor - subtotalOnly.perParticipant[i].amountMinor),
          0,
        )
        expect(pool).toBe(input.remainder.amountMinor)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

describe('Property 4: PROPORTIONAL remainder is monotonic in subtotal', () => {
  it('a larger subtotal never gets a smaller positive-remainder slice', () => {
    const arbPositiveProportional = fc
      .integer({ min: 1, max: 5 })
      .chain((participantCount) => {
        const ids = makeIds(participantCount)
        const arbItem: fc.Arbitrary<ItemizedItem> = fc.record({
          amountMinor: fc.integer({ min: 0, max: 500_000 }),
          assignedParticipantIds: fc
            .subarray(ids, { minLength: 1, maxLength: participantCount })
            .map((sub) => (sub.length > 0 ? sub : [ids[0]])),
        })
        return fc.record({
          participantIdsInOrder: fc.constant(ids),
          items: fc.array(arbItem, { minLength: 0, maxLength: 8 }),
          remainder: fc.integer({ min: 0, max: 100_000 }).map(
            (amountMinor): ItemizedRemainder => ({
              amountMinor,
              allocationMode: 'PROPORTIONAL',
            }),
          ),
        })
      })

    fc.assert(
      fc.property(arbPositiveProportional, (input) => {
        const noRem = computeItemizedShares({
          ...input,
          remainder: { amountMinor: 0, allocationMode: 'PROPORTIONAL' },
        })
        const withRem = computeItemizedShares(input)
        const rows = input.participantIdsInOrder.map((_, i) => ({
          subtotal: noRem.perParticipant[i].amountMinor,
          slice:
            withRem.perParticipant[i].amountMinor -
            noRem.perParticipant[i].amountMinor,
        }))
        for (const a of rows) {
          for (const b of rows) {
            if (a.subtotal > b.subtotal) {
              expect(a.slice).toBeGreaterThanOrEqual(b.slice)
            }
          }
        }
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
