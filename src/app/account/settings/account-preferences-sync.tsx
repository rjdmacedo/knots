'use client'

import { Locale } from '@/i18n'
import { setUserLocale } from '@/lib/locale'
import { useLocale } from 'next-intl'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Applies account-level preferences to the local device once on mount (task 6.2).
 *
 * The server resolves the signed-in user's stored `locale` / `theme` and passes
 * them in. This client component compares them to the live cookie-derived locale
 * (`useLocale`) and the current `next-themes` value, and only acts on a real
 * difference so a second device follows the account (req 8.6).
 *
 * It writes only on the client after mount and refreshes at most once, so the
 * server render never loops. Renders nothing.
 */
export function AccountPreferencesSync({
  locale,
  theme,
}: {
  locale: Locale | null
  theme: string | null
}) {
  const activeLocale = useLocale() as Locale
  const { theme: currentTheme, setTheme } = useTheme()
  const router = useRouter()
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    // Locale: write the cookie and refresh once when the stored value differs.
    if (locale && locale !== activeLocale) {
      setUserLocale(locale)
        .then(() => router.refresh())
        .catch((error) => {
          console.error('Failed to sync account locale:', error)
        })
    }

    // Theme: apply the stored value to next-themes when it differs.
    if (theme && theme !== currentTheme) {
      setTheme(theme)
    }
    // Intentionally run once on mount; guarded by `didRun` and value comparisons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
