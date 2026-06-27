'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Currency } from '@/lib/currency'
import type { TrendMonth } from '@/lib/expense-detail-trends'
import { cn, formatCurrency } from '@/lib/utils'
import { BarChart3 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  contextName: string
  categoryName: string
  months: TrendMonth[]
  currency: Currency
  statsHref: string
}

export function ExpenseDetailTrends({
  contextName,
  categoryName,
  months,
  currency,
  statsHref,
}: Props) {
  const t = useTranslations('ExpenseDetail')
  const locale = useLocale()
  const maxAmount = Math.max(...months.map((month) => month.amount), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {t('trendsTitle', { contextName, categoryName })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {months.map((month) => {
            const label = new Date(month.year, month.month).toLocaleDateString(
              locale,
              { month: 'short' },
            )
            const formattedAmount = formatCurrency(
              currency,
              month.amount,
              locale,
            )
            const width =
              month.amount > 0
                ? `${Math.max((month.amount / maxAmount) * 100, 8)}%`
                : '0%'

            return (
              <div
                key={`${month.year}-${month.month}`}
                className="flex items-center gap-3"
              >
                <span className="w-10 shrink-0 text-sm text-muted-foreground">
                  {label}
                </span>
                <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
                  <div
                    className={cn(
                      'absolute inset-y-0 start-0 rounded-md bg-primary/25',
                      month.amount === 0 && 'hidden',
                    )}
                    style={{ width }}
                  />
                </div>
                <span className="w-24 shrink-0 text-end text-sm tabular-nums text-muted-foreground">
                  {formattedAmount}
                </span>
              </div>
            )
          })}
        </div>

        <Button
          variant="secondary"
          className="w-full"
          render={<Link href={statsHref} />}
        >
          <BarChart3 className="size-4" data-icon="inline-start" />
          {t('trendsSeeMore')}
        </Button>
      </CardContent>
    </Card>
  )
}
