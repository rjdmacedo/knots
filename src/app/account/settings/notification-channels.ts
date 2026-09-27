/**
 * Pure helpers for notification channel selection.
 *
 * Framework-free, side-effect-free module shared by the notification
 * preferences UI (task 7.3) and its property test (task 7.2). It answers two
 * questions about a channel set:
 *
 *  - How does toggling one channel change the set? (`toggleChannel`)
 *  - What stable label describes the set? (`channelLabelKey`)
 *
 * The label is returned as a KEY, not an English string. The UI maps the key to
 * i18n copy (Off / Email / Push / Email + Push per requirement 9.5); keeping the
 * mapping here pure and total lets the property test enumerate every set.
 */

import type { NotificationChannels } from './notification-category-metadata'

/** Which channel a toggle targets. */
export type ChannelKey = 'email' | 'push'

/** Stable label keys the closed channel selector can display. */
export type ChannelLabelKey = 'off' | 'email' | 'push' | 'emailAndPush'

/**
 * Flip a single channel, returning a new set. The other channel is untouched.
 *
 * This is its own inverse: `toggleChannel(toggleChannel(c, w), w)` equals `c`.
 */
export function toggleChannel(
  channels: NotificationChannels,
  which: ChannelKey,
): NotificationChannels {
  return { ...channels, [which]: !channels[which] }
}

/**
 * The closed-selector label key for a channel set. A total, pure function of the
 * set: the same input always yields the same key, one of the four values.
 */
export function channelLabelKey(
  channels: NotificationChannels,
): ChannelLabelKey {
  if (channels.email && channels.push) return 'emailAndPush'
  if (channels.email) return 'email'
  if (channels.push) return 'push'
  return 'off'
}
