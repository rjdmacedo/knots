/**
 * Pure state transitions for the documentation ↔ authoritative itemization gate
 * (Requirements 12, 13). These are the core of the "Switch to itemised?" and
 * "Leave itemised" flows, kept pure so they can be unit-tested without rendering
 * the whole expense form. The form component owns the dialogs and calls these to
 * compute the next form values.
 */

import { ExpenseFormValues } from '@/lib/schemas'
import { SplitMode } from '@prisma/client'

type Itemization = NonNullable<ExpenseFormValues['itemization']>
type PaidFor = ExpenseFormValues['paidFor']

/**
 * Seed a fresh documentation itemization (marker off, no items, PROPORTIONAL
 * remainder). Used when the user opens the items section.
 */
export function emptyDocumentationItemization(): Itemization {
  return {
    authoritative: false,
    items: [],
    remainder: { allocationMode: 'PROPORTIONAL' },
  }
}

/**
 * Switch confirm: make the current (documentation) itemization authoritative.
 * Items and remainder are preserved; only the marker flips. If there is no
 * itemization yet, an empty authoritative one is created.
 */
export function switchToAuthoritative(
  current: Itemization | undefined,
): Itemization {
  return {
    authoritative: true,
    items: current?.items ?? [],
    remainder: current?.remainder ?? { allocationMode: 'PROPORTIONAL' },
  }
}

/**
 * Leave confirm: return to a legacy split. The items are KEPT as documentation
 * (Requirement 13.4) — only the marker flips off. Returns the next itemization
 * (documentation), the legacy split mode to restore, and the rebalanced paidFor
 * (an even split over the current participants).
 */
export function leaveAuthoritative(
  current: Itemization | undefined,
  currentPaidFor: PaidFor,
): {
  itemization: Itemization | undefined
  splitMode: SplitMode
  paidFor: PaidFor
} {
  return {
    itemization: current ? { ...current, authoritative: false } : undefined,
    splitMode: 'EVENLY',
    // Even split: each current participant gets weight 1.
    paidFor: currentPaidFor.map((pf) => ({ ...pf, shares: 1 })),
  }
}
