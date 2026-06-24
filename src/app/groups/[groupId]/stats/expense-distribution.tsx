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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Currency } from '@/lib/currency'
import { participantEmphasisClassName } from '@/lib/participant-emphasis'
import { ExpenseDistributionItem } from '@/lib/stats'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

type Props = {
  data: ExpenseDistributionItem[]
  currency: Currency
  emphasizedParticipantIds?: string[]
}

export function ExpenseDistribution({
  data,
  currency,
  emphasizedParticipantIds,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.ExpenseDistribution')

  if (data.length === 0) {
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

  const chartData = data.map((item) => ({
    participantId: item.participantId,
    name: item.participantName,
    paid: item.totalPaid,
    share: item.totalShare,
    difference: item.difference,
    formattedPaid: formatCurrency(currency, item.totalPaid, locale),
    formattedShare: formatCurrency(currency, item.totalShare, locale),
    formattedDifference: formatCurrency(
      currency,
      Math.abs(item.difference),
      locale,
    ),
  }))

  const chartConfig = {
    paid: {
      label: t('paid'),
      color: 'var(--primary)',
    },
    share: {
      label: t('share'),
      color: 'var(--chart-2)',
    },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: `${Math.max(data.length * 50, 150)}px` }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 10 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={80}
              tick={({ x, y, payload }) => {
                const item = chartData.find(
                  (entry) => entry.name === payload.value,
                )
                const opacity =
                  item &&
                  emphasizedParticipantIds &&
                  !emphasizedParticipantIds.includes(item.participantId)
                    ? 0.5
                    : 1

                const label =
                  typeof payload.value === 'string' && payload.value.length > 10
                    ? `${payload.value.slice(0, 10)}…`
                    : payload.value

                return (
                  <text
                    x={x}
                    y={y}
                    dy={4}
                    textAnchor="end"
                    fill="currentColor"
                    opacity={opacity}
                    className="text-xs fill-muted-foreground"
                  >
                    {label}
                  </text>
                )
              }}
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatCurrency(currency, value, locale)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => {
                    const payload = item.payload
                    if (name === 'paid') {
                      return (
                        <span>
                          {t('paid')}: {payload.formattedPaid}
                        </span>
                      )
                    }
                    if (name === 'share') {
                      return (
                        <span>
                          {t('share')}: {payload.formattedShare}
                        </span>
                      )
                    }
                    return null
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="paid"
              radius={[0, 4, 4, 0]}
              fill="var(--color-paid)"
            />
            <Bar
              dataKey="share"
              radius={[0, 4, 4, 0]}
              fill="var(--color-share)"
            />
          </BarChart>
        </ChartContainer>

        <div className="mt-4 space-y-2">
          {data.map((item) => (
            <div
              key={item.participantId}
              className={cn(
                'flex items-center justify-between text-sm',
                participantEmphasisClassName(
                  item.participantId,
                  emphasizedParticipantIds,
                ),
              )}
            >
              <span className="font-medium">{item.participantName}</span>
              <span
                className={
                  item.difference > 0
                    ? 'text-green-600 dark:text-green-400'
                    : item.difference < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                }
              >
                {item.difference > 0
                  ? `+${formatCurrency(currency, item.difference, locale)} (${t(
                      'overpaid',
                    )})`
                  : item.difference < 0
                    ? `-${formatCurrency(
                        currency,
                        Math.abs(item.difference),
                        locale,
                      )} (${t('underpaid')})`
                    : formatCurrency(currency, 0, locale)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
