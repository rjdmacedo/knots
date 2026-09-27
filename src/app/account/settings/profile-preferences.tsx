'use client'

import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTranslations } from 'next-intl'
import { CurrencyPreferenceSelect } from './currency-preference-select'
import { TimezoneSelect } from './timezone-select'

export function ProfilePreferences({
  timezone,
  preferredCurrency,
}: {
  timezone: string | null
  preferredCurrency: string | null
}) {
  const t = useTranslations('ProfileSettings')

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">
          {t('Preferences.timezoneLabel')}
        </div>
        <TimezoneSelect currentTimezone={timezone} />
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">
          {t('Preferences.currencyLabel')}
        </div>
        <CurrencyPreferenceSelect currentCurrency={preferredCurrency} />
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t('languageLabel')}</div>
        <LocaleSwitcher />
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">{t('themeLabel')}</div>
        <ThemeToggle />
      </div>
    </div>
  )
}
