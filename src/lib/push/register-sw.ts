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
 * - `serviceWorker` is available in `navigator`
 * - `PushManager` is available in `window`
 * - `Notification` is available in `window`
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
    return registration
  } catch (error) {
    console.warn('[push] Service worker registration failed:', error)
    return null
  }
}
