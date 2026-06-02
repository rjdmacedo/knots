'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Locale, localeLabels } from '@/i18n'
import { setUserLocale } from '@/lib/locale'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'

export function LocaleSwitcher() {
  const locale = useLocale() as Locale
  const [isPending, startTransition] = useTransition()

  const handleLocaleChange = async (newLocale: Locale) => {
    startTransition(async () => {
      try {
        await setUserLocale(newLocale)
      } catch (error) {
        console.error('Failed to change locale:', error)
      }
    })
  }

  return (
    <Select
      value={locale}
      onValueChange={(val) => handleLocaleChange(val as Locale)}
      disabled={isPending}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={localeLabels[locale]} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(localeLabels).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
