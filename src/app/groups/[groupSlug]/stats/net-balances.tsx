'use client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { participantEmphasisClassName } from '@/lib/participant-emphasis'
import { NetBalanceItem } from '@/lib/stats'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  netBalances: NetBalanceItem[]
  currency: Currency
  emphasizedParticipantIds?: string[]
}

export function NetBalances({
  netBalances,
  currency,
  emphasizedParticipantIds,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.NetBalances')

  if (netBalances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {netBalances.map((item) => {
            const isPositive = item.netBalance > 0
            const isNegative = item.netBalance < 0
            const isZero = item.netBalance === 0

            const statusLabel = isPositive
              ? t('owed')
              : isNegative
                ? t('owes')
                : t('settled')

            return (
              <li
                key={item.participantId}
                className={cn(
                  'flex items-center justify-between',
                  participantEmphasisClassName(
                    item.participantId,
                    emphasizedParticipantIds,
                  ),
                )}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {item.participantName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statusLabel}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    isPositive && 'text-green-600',
                    isNegative && 'text-red-600',
                    isZero && 'text-muted-foreground',
                  )}
                >
                  {isNegative ? '-' : ''}
                  {formatCurrency(currency, Math.abs(item.netBalance), locale)}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
