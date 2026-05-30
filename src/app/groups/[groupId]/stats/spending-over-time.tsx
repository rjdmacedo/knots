'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { Currency } from '@/lib/currency'
import type { MonthlySpendingItem } from '@/lib/stats'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

type Props = {
  data: MonthlySpendingItem[]
  currency: Currency
}

export function SpendingOverTime({ data, currency }: Props) {
  const t = useTranslations('Stats.SpendingOverTime')
  const locale = useLocale()

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('emptyState')}</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((item) => ({
    label: new Date(item.year, item.month).toLocaleDateString(locale, {
      month: 'short',
      year: 'numeric',
    }),
    amount: item.amount,
  }))

  const chartConfig = {
    amount: {
      label: t('amount'),
      color: 'var(--primary)',
    },
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => formatCurrency(currency, value, locale)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    formatCurrency(currency, value as number, locale)
                  }
                />
              }
            />
            <Bar
              dataKey="amount"
              fill="var(--color-amount)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
