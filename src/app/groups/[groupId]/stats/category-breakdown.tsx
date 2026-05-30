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
  type ChartConfig,
} from '@/components/ui/chart'
import { Currency } from '@/lib/currency'
import { CategoryBreakdownItem } from '@/lib/stats'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

type Props = {
  data: CategoryBreakdownItem[]
  currency: Currency
}

export function CategoryBreakdown({ data, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.CategoryBreakdown')

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
    categoryName: item.categoryName,
    amount: item.amount,
    formattedAmount: formatCurrency(currency, item.amount, locale),
    percentage: item.percentage,
  }))

  const chartConfig = {
    amount: {
      label: t('amount'),
      color: 'var(--primary)',
    },
  } satisfies ChartConfig

  const CustomTooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const item = payload[0].payload
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
        <p className="font-medium">{item.categoryName}</p>
        <p>
          {t('amount')}: {item.formattedAmount}
        </p>
        <p>
          {t('percentage')}: {item.percentage.toFixed(1)}%
        </p>
      </div>
    )
  }

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
          style={{ height: `${Math.max(chartData.length * 44, 100)}px` }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 80 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="categoryName"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={100}
              tickFormatter={(value) =>
                value.length > 12 ? value.slice(0, 12) + '…' : value
              }
            />
            <XAxis type="number" hide />
            <ChartTooltip cursor={false} content={<CustomTooltipContent />} />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={4}>
              <LabelList
                dataKey="formattedAmount"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
