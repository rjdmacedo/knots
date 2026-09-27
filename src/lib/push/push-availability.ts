import { isPushSupported } from '@/lib/push/register-sw'

/**
 * Why (if at all) the Push channel is unavailable on this device.
 *
 * - `unsupported`: the browser lacks the service worker / push APIs.
 * - `unconfigured`: the deployment has no `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
 * - `iosInstall`: iOS Safari that is not installed to the home screen.
 * - `denied`: the user has denied notification permission.
 * - `null`: push is available and can be toggled.
 */
export type PushDisabledReason =
  | 'unsupported'
  | 'unconfigured'
  | 'iosInstall'
  | 'denied'
  | null

/** True on iOS Safari that is not running as an installed home-screen app. */
export function isIosNeedsInstall(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined')
    return false
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  if (!isIos) return false
  // Standalone display means it was added to the home screen.
  const standalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true ||
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
  return !standalone
}

/**
 * Determine why (if at all) the Push channel is unavailable on this device.
 * Runs only on the client; returns `null` while unknown / on the server.
 */
export function detectPushDisabledReason(): PushDisabledReason {
  if (typeof window === 'undefined') return null
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'unconfigured'
  // On iOS the push APIs are missing until the app is installed, so the
  // home-screen check has to win over "unsupported".
  if (isIosNeedsInstall()) return 'iosInstall'
  if (!isPushSupported()) return 'unsupported'
  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'denied'
  ) {
    return 'denied'
  }
  return null
}
