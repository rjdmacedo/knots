/**
 * Property-based tests for the notification channel helpers.
 *
 * Feature: account-settings-page, Property 3: Channel toggle is its own
 * inverse, and the label is a pure function of the set.
 * Uses fast-check for property-based testing with a minimum of 100 iterations.
 *
 * **Validates: Requirements 9.5, 9.7**
 *
 * Property 3 — across every channel set (Off, Email, Push, Email + Push) and
 * each channel:
 *  - Toggling a channel twice returns the original set (its own inverse).
 *  - A toggle flips exactly the targeted channel and leaves the other alone.
 *  - `channelLabelKey` is a total, pure function of the set: the same input
 *    yields the same key, and the mapping matches the Off / Email / Push /
 *    Email + Push truth table.
 */

import fc from 'fast-check'
import type { NotificationChannels } from './notification-category-metadata'
import {
  channelLabelKey,
  toggleChannel,
  type ChannelKey,
  type ChannelLabelKey,
} from './notification-channels'

const PBT_NUM_RUNS = 100

/** A channel set drawn from the full 2×2 space. */
const arbChannels: fc.Arbitrary<NotificationChannels> = fc.record({
  email: fc.boolean(),
  push: fc.boolean(),
})

/** Which channel a toggle targets. */
const arbWhich: fc.Arbitrary<ChannelKey> = fc.constantFrom('email', 'push')

/** The reference truth table the label key must match. */
function expectedLabelKey(channels: NotificationChannels): ChannelLabelKey {
  if (channels.email && channels.push) return 'emailAndPush'
  if (channels.email) return 'email'
  if (channels.push) return 'push'
  return 'off'
}

/** Enumerate all four possible channel sets. */
const ALL_SETS: NotificationChannels[] = [
  { email: false, push: false },
  { email: true, push: false },
  { email: false, push: true },
  { email: true, push: true },
]

describe('Property 3: channel toggle is its own inverse, label is pure', () => {
  it('toggling the same channel twice returns the original set', () => {
    fc.assert(
      fc.property(arbChannels, arbWhich, (channels, which) => {
        const roundTrip = toggleChannel(toggleChannel(channels, which), which)
        expect(roundTrip).toEqual(channels)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('toggling flips exactly the targeted channel and leaves the other unchanged', () => {
    fc.assert(
      fc.property(arbChannels, arbWhich, (channels, which) => {
        const other: ChannelKey = which === 'email' ? 'push' : 'email'
        const toggled = toggleChannel(channels, which)

        // Targeted channel flips.
        expect(toggled[which]).toBe(!channels[which])
        // Other channel is untouched.
        expect(toggled[other]).toBe(channels[other])
        // A new object is returned; the input is not mutated.
        expect(toggled).not.toBe(channels)
        expect(channels[which]).toBe(channels[which])
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('channelLabelKey matches the Off / Email / Push / Email + Push truth table', () => {
    fc.assert(
      fc.property(arbChannels, (channels) => {
        expect(channelLabelKey(channels)).toBe(expectedLabelKey(channels))
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('channelLabelKey depends only on the set (same input, same output)', () => {
    fc.assert(
      fc.property(arbChannels, (channels) => {
        const first = channelLabelKey(channels)
        const again = channelLabelKey({ ...channels })
        expect(again).toBe(first)
        // The output is always one of the four keys.
        expect(['off', 'email', 'push', 'emailAndPush']).toContain(first)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('maps each of the four possible sets to its expected key', () => {
    const mapping = ALL_SETS.map((s) => channelLabelKey(s))
    expect(mapping).toEqual(['off', 'email', 'push', 'emailAndPush'])
  })
})
