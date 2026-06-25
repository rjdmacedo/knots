'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { MonthOverMonthData } from '@/lib/stats'
import { formatCurrency } from '@/lib/utils'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  data: MonthOverMonthData | null
  currency: Currency
}

export function MonthOverMonth({ data, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.MonthOverMonth')

  if (data === null) return null

  const { absoluteDifference, percentageChange } = data

  const isIncrease = absoluteDifference > 0
  const isDecrease = absoluteDifference < 0
  const isNeutral = absoluteDifference === 0

  const formattedDifference = formatCurrency(
    currency,
    Math.abs(absoluteDifference),
    locale,
  )

  const formattedPercentage = `${Math.abs(
    Math.round(percentageChange * 10) / 10,
  ).toFixed(1)}%`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          {isIncrease && (
            <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
          )}
          {isDecrease && (
            <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          {isNeutral && <Minus className="h-5 w-5 text-muted-foreground" />}
          <div>
            <div className="text-lg font-semibold">
              {isIncrease && '+'}
              {isDecrease && '-'}
              {formattedDifference} ({isIncrease && '+'}
              {isDecrease && '-'}
              {formattedPercentage})
            </div>
            <div className="text-sm text-muted-foreground">
              {isIncrease && t('increase')}
              {isDecrease && t('decrease')}
              {isNeutral && t('noChange')} {t('vsLastMonth')}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
