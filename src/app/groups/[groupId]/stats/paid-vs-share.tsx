'use client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { PaidVsShareItem } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

type Props = {
  paidVsSharePercentages: PaidVsShareItem[]
  currency: Currency
}

export function PaidVsShare({ paidVsSharePercentages }: Props) {
  const t = useTranslations('Stats.PaidVsShare')

  if (paidVsSharePercentages.length === 0) {
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
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('participant')}</span>
            <div className="flex gap-4">
              <span className="w-16 text-right">{t('paidPercentage')}</span>
              <span className="w-16 text-right">{t('sharePercentage')}</span>
            </div>
          </div>
          <ul className="space-y-3">
            {paidVsSharePercentages.map((item) => {
              const paidMore = item.paidPercentage > item.sharePercentage
              const paidLess = item.paidPercentage < item.sharePercentage

              return (
                <li
                  key={item.participantId}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm font-medium">
                    {item.participantName}
                  </span>
                  <div className="flex gap-4">
                    <span
                      className={cn(
                        'w-16 text-right text-sm font-medium',
                        paidMore && 'text-green-600',
                        paidLess && 'text-red-600',
                      )}
                    >
                      {item.paidPercentage.toFixed(1)}%
                    </span>
                    <span className="w-16 text-right text-sm text-muted-foreground">
                      {item.sharePercentage.toFixed(1)}%
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
