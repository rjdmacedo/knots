'use client'

import { CurrencySelector } from '@/components/currency-selector'
import { Locale } from '@/i18n'
import { defaultCurrencyList } from '@/lib/currency'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

export function CurrencyPreferenceSelect({
  currentCurrency,
}: {
  currentCurrency: string | null
}) {
  const t = useTranslations('ProfileSettings.Preferences')
  const locale = useLocale() as Locale

  const utils = trpc.useUtils()
  const changePreferences = trpc.profile.changePreferences.useMutation({
    onSuccess: () => {
      toast.success(t('currencySaved'))
      utils.profile.getProfile.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const currencies = defaultCurrencyList(locale, null)

  return (
    <CurrencySelector
      currencies={currencies}
      defaultValue={currentCurrency ?? 'EUR'}
      isLoading={changePreferences.isPending}
      onValueChange={(code) => {
        changePreferences.mutate({ preferredCurrency: code })
      }}
    />
  )
}
