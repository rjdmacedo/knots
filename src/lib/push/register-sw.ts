/**
 * Service worker registration utility for push notifications.
 *
 * Provides feature detection and service worker lifecycle management
 * for the Web Push API integration.
 */

/**
 * Checks whether the browser supports push notifications.
 *
 * Returns true only when all three prerequisites are met:
 * - `serviceWorker` in navigator
 * - `PushManager` in window
 * - `Notification` in window
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Registers the service worker at `/sw.js` and returns the registration.
 *
 * Returns `null` if push is not supported or registration fails.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return registration
  } catch (error) {
    console.warn('[push] Service worker registration failed:', error)
    return null
  }
}

/**
 * Returns the existing push subscription for this registration, or creates one.
 */
export async function getOrCreatePushSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string | undefined,
): Promise<PushSubscription | null> {
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing
  if (!vapidPublicKey) return null

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  })
}
