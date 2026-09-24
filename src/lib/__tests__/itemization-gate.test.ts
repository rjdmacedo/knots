/**
 * Unit tests for the documentation ↔ authoritative itemization gate transitions.
 *
 * Feature: itemized-expenses (v1.1)
 *
 * **Validates: Requirements 12.1, 12.3, 12.4, 13.2, 13.4**
 */

import {
  emptyDocumentationItemization,
  leaveAuthoritative,
  switchToAuthoritative,
} from '../itemization-gate'

describe('emptyDocumentationItemization', () => {
  it('seeds a documentation itemization (marker off, no items, PROPORTIONAL)', () => {
    const it0 = emptyDocumentationItemization()
    expect(it0.authoritative).toBe(false)
    expect(it0.items).toEqual([])
    expect(it0.remainder.allocationMode).toBe('PROPORTIONAL')
  })
})

describe('switchToAuthoritative (Requirement 12.3)', () => {
  it('flips the marker on while keeping items and remainder', () => {
    const before = {
      authoritative: false,
      items: [
        {
          title: 'Burger',
          amount: 3000,
          unitPrice: 3000,
          quantity: 1,
          assignedParticipants: ['a'],
        },
      ],
      remainder: {
        amount: 600,
        allocationMode: 'CUSTOM' as const,
        splitMode: 'EVENLY' as const,
        paidFor: [{ participant: 'a', shares: 1 }],
      },
    }
    const after = switchToAuthoritative(before)
    expect(after.authoritative).toBe(true)
    expect(after.items).toEqual(before.items)
    expect(after.remainder).toEqual(before.remainder)
  })

  it('creates an empty authoritative itemization when there is none', () => {
    const after = switchToAuthoritative(undefined)
    expect(after.authoritative).toBe(true)
    expect(after.items).toEqual([])
    expect(after.remainder.allocationMode).toBe('PROPORTIONAL')
  })
})

describe('leaveAuthoritative (Requirement 13.2, 13.4)', () => {
  it('keeps items as documentation (marker off) and restores an even split', () => {
    const current = {
      authoritative: true,
      items: [
        { title: 'Burger', amount: 3000, unitPrice: 3000, quantity: 1, assignedParticipants: ['a'] },
        { title: 'Salad', amount: 1000, unitPrice: 1000, quantity: 1, assignedParticipants: ['b'] },
      ],
      remainder: { amount: 600, allocationMode: 'PROPORTIONAL' as const },
    }
    const paidFor = [
      { participant: 'a', shares: 3450 },
      { participant: 'b', shares: 1150 },
    ]

    const next = leaveAuthoritative(current, paidFor)

    // Items are kept, not deleted; only the marker flips off (documentation).
    expect(next.itemization?.authoritative).toBe(false)
    expect(next.itemization?.items).toEqual(current.items)
    expect(next.itemization?.remainder).toEqual(current.remainder)
    // The legacy split is restored to an even EVENLY split.
    expect(next.splitMode).toBe('EVENLY')
    expect(next.paidFor).toEqual([
      { participant: 'a', shares: 1 },
      { participant: 'b', shares: 1 },
    ])
  })

  it('handles a missing itemization gracefully', () => {
    const next = leaveAuthoritative(undefined, [{ participant: 'a', shares: 5 }])
    expect(next.itemization).toBeUndefined()
    expect(next.splitMode).toBe('EVENLY')
    expect(next.paidFor).toEqual([{ participant: 'a', shares: 1 }])
  })
})
