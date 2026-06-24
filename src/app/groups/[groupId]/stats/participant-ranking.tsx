import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { participantEmphasisClassName } from '@/lib/participant-emphasis'
import { ParticipantRankingItem } from '@/lib/stats'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  ranking: ParticipantRankingItem[]
  currency: Currency
  emphasizedParticipantIds?: string[]
}

export function ParticipantRanking({
  ranking,
  currency,
  emphasizedParticipantIds,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.ParticipantRanking')

  if (ranking.length === 0) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {ranking.map((item, index) => (
            <li
              key={item.participantId}
              className={cn(
                'flex items-center gap-3',
                participantEmphasisClassName(
                  item.participantId,
                  emphasizedParticipantIds,
                ),
              )}
            >
              <span className="text-muted-foreground w-6 text-right text-sm font-medium">
                {index + 1}.
              </span>
              <span className="flex-1 truncate font-medium">
                {item.participantName}
              </span>
              <span className="text-sm">
                {formatCurrency(currency, item.totalPaid, locale)}
              </span>
              <span className="text-muted-foreground w-16 text-right text-sm">
                {item.percentage.toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
