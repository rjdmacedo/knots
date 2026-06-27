'use client'

import { CurrencyPreferenceSelect } from '@/app/settings/currency-preference-select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function FriendSettingsView() {
  const t = useTranslations('Friends.Settings')
  const { data: profile, isLoading } = trpc.profile.getProfile.useQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('currencyTitle')}</CardTitle>
        <CardDescription>{t('currencyDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="max-w-sm">
        <CurrencyPreferenceSelect
          currentCurrency={profile?.preferredCurrency ?? null}
        />
      </CardContent>
    </Card>
  )
}
