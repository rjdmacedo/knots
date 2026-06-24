const APP_COOKIE_NAMES = ['NEXT_LOCALE'] as const

function clearCookie(name: string) {
  const expires = 'Max-Age=0'
  document.cookie = `${name}=; ${expires}; path=/`
  document.cookie = `${name}=; ${expires}; path=/; SameSite=Lax`
}

/**
 * Clears client-side app state that can survive across reloads and cause
 * stale or corrupted UI after upgrades or runtime errors.
 */
export function clearAppClientState(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.clear()
  } catch (error) {
    console.error('[clearAppClientState] Failed to clear localStorage:', error)
  }

  try {
    window.sessionStorage.clear()
  } catch (error) {
    console.error(
      '[clearAppClientState] Failed to clear sessionStorage:',
      error,
    )
  }

  for (const name of APP_COOKIE_NAMES) {
    try {
      clearCookie(name)
    } catch (error) {
      console.error(
        `[clearAppClientState] Failed to clear cookie ${name}:`,
        error,
      )
    }
  }

  if ('caches' in window) {
    void caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .catch((error) => {
        console.error('[clearAppClientState] Failed to clear caches:', error)
      })
  }
}
