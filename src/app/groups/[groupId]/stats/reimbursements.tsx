'use client'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Currency } from '@/lib/currency'
import { ReimbursementStats } from '@/lib/stats'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  data: ReimbursementStats
  currency: Currency
}

export function Reimbursements({ data, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.Reimbursements')

  const hasRecorded = data.recorded.length > 0
  const hasSuggested = data.suggested.length > 0

  if (!hasRecorded && !hasSuggested) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('allSettled')}</p>
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
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('recordedTitle')}</h3>
            {hasRecorded && (
              <Badge variant="secondary">
                {t('totalRecorded', {
                  amount: formatCurrency(
                    currency,
                    data.totalRecordedAmount,
                    locale,
                  ),
                })}
              </Badge>
            )}
          </div>

          {hasRecorded ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('titleColumn')}</TableHead>
                  <TableHead>{t('from')}</TableHead>
                  <TableHead>{t('to')}</TableHead>
                  <TableHead className="text-end">{t('amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recorded.map((item) => (
                  <TableRow key={item.expenseId}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(item.date, locale, { dateStyle: 'medium' })}
                    </TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell>{item.fromName}</TableCell>
                    <TableCell>{item.toName}</TableCell>
                    <TableCell className="text-end font-medium">
                      {formatCurrency(currency, item.amount, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('recordedEmpty')}
            </p>
          )}
        </div>

        {hasRecorded && hasSuggested && <Separator />}

        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium">{t('suggestedTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('suggestedDescription')}
            </p>
          </div>

          {hasSuggested ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('from')}</TableHead>
                  <TableHead>{t('to')}</TableHead>
                  <TableHead className="text-end">{t('amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suggested.map((item) => (
                  <TableRow key={`${item.fromId}-${item.toId}-${item.amount}`}>
                    <TableCell>{item.fromName}</TableCell>
                    <TableCell>{item.toName}</TableCell>
                    <TableCell className="text-end font-medium">
                      {formatCurrency(currency, item.amount, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('suggestedEmpty')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
