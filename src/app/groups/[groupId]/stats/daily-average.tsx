import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  dailyAverage: number | null
  currency: Currency
}

export function DailyAverage({ dailyAverage, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.DailyAverage')

  if (dailyAverage === null) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formatCurrency(currency, Math.round(dailyAverage), locale)}
        </div>
        <p className="text-sm text-muted-foreground">{t('perDay')}</p>
      </CardContent>
    </Card>
  )
}
