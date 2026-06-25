import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { AggregateMetricsData } from '@/lib/stats'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  data: AggregateMetricsData
  currency: Currency
}

export function AggregateMetrics({ data, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.AggregateMetrics')

  if (data.totalCount === 0) {
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
        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-muted-foreground">{t('totalCount')}</dt>
            <dd className="text-lg font-medium">{data.totalCount}</dd>
          </div>

          {data.averageAmount !== null && (
            <div>
              <dt className="text-sm text-muted-foreground">{t('average')}</dt>
              <dd className="text-lg font-medium">
                {formatCurrency(
                  currency,
                  Math.round(data.averageAmount),
                  locale,
                )}
              </dd>
            </div>
          )}

          {data.largestExpense && (
            <div>
              <dt className="text-sm text-muted-foreground">{t('largest')}</dt>
              <dd>
                <p className="text-lg font-medium">
                  {data.largestExpense.title}
                </p>
                <p className="text-sm">
                  {formatCurrency(currency, data.largestExpense.amount, locale)}{' '}
                  &middot;{' '}
                  {formatDate(new Date(data.largestExpense.date), locale, {
                    dateStyle: 'medium',
                  })}
                </p>
              </dd>
            </div>
          )}

          {data.mostRecentExpense && (
            <div>
              <dt className="text-sm text-muted-foreground">
                {t('mostRecent')}
              </dt>
              <dd>
                <p className="text-lg font-medium">
                  {data.mostRecentExpense.title}
                </p>
                <p className="text-sm">
                  {formatCurrency(
                    currency,
                    data.mostRecentExpense.amount,
                    locale,
                  )}{' '}
                  &middot;{' '}
                  {formatDate(new Date(data.mostRecentExpense.date), locale, {
                    dateStyle: 'medium',
                  })}
                </p>
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
