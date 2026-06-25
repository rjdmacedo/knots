'use client'

import { AggregateMetrics } from '@/app/groups/[groupSlug]/stats/aggregate-metrics'
import { CategoryBreakdown } from '@/app/groups/[groupSlug]/stats/category-breakdown'
import { DailyAverage } from '@/app/groups/[groupSlug]/stats/daily-average'
import { ExpenseDistribution } from '@/app/groups/[groupSlug]/stats/expense-distribution'
import { MonthOverMonth } from '@/app/groups/[groupSlug]/stats/month-over-month'
import { NetBalances } from '@/app/groups/[groupSlug]/stats/net-balances'
import { PaidVsShare } from '@/app/groups/[groupSlug]/stats/paid-vs-share'
import { ParticipantRanking } from '@/app/groups/[groupSlug]/stats/participant-ranking'
import { Reimbursements } from '@/app/groups/[groupSlug]/stats/reimbursements'
import { SpendingOverTime } from '@/app/groups/[groupSlug]/stats/spending-over-time'
import { TotalsGroupSpending } from '@/app/groups/[groupSlug]/stats/totals-group-spending'
import { TotalsYourShare } from '@/app/groups/[groupSlug]/stats/totals-your-share'
import { TotalsYourSpendings } from '@/app/groups/[groupSlug]/stats/totals-your-spending'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { FriendCurrencyStats } from '@/lib/friend-stats'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useSpinDelay } from 'spin-delay'

type Props = {
  friendId: string
}

function FriendCurrencyStatsSection({
  stats,
  emphasizedParticipantIds,
}: {
  stats: FriendCurrencyStats
  emphasizedParticipantIds?: string[]
}) {
  const t = useTranslations('Stats')
  const { currency } = stats
  const hasNoData =
    stats.aggregateMetrics.totalCount === 0 &&
    stats.categoryBreakdown.length === 0

  if (hasNoData) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('Totals.title')}
            {stats.currency.code ? ` (${stats.currency.code})` : ''}
          </CardTitle>
          <CardDescription>{t('Totals.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <TotalsGroupSpending
            totalGroupSpendings={stats.totalGroupSpendings}
            currency={currency}
          />
          <TotalsYourSpendings
            totalParticipantSpendings={stats.totalParticipantSpendings}
            currency={currency}
          />
          <TotalsYourShare
            totalParticipantShare={stats.totalParticipantShare}
            currency={currency}
          />
        </CardContent>
      </Card>

      <CategoryBreakdown data={stats.categoryBreakdown} currency={currency} />
      <ParticipantRanking
        ranking={stats.participantRanking}
        currency={currency}
        emphasizedParticipantIds={emphasizedParticipantIds}
      />
      <ExpenseDistribution
        data={stats.expenseDistribution}
        currency={currency}
        emphasizedParticipantIds={emphasizedParticipantIds}
      />
      <Reimbursements
        data={stats.reimbursements}
        currency={currency}
        emphasizedParticipantIds={emphasizedParticipantIds}
      />
      <SpendingOverTime data={stats.spendingOverTime} currency={currency} />
      <MonthOverMonth data={stats.monthOverMonth} currency={currency} />
      <DailyAverage dailyAverage={stats.dailyAverage} currency={currency} />
      <AggregateMetrics data={stats.aggregateMetrics} currency={currency} />
      <NetBalances
        netBalances={stats.netBalances}
        currency={currency}
        emphasizedParticipantIds={emphasizedParticipantIds}
      />
      <PaidVsShare
        paidVsSharePercentages={stats.paidVsSharePercentages}
        currency={currency}
        emphasizedParticipantIds={emphasizedParticipantIds}
      />
    </div>
  )
}

export function FriendStats({ friendId }: Props) {
  const t = useTranslations('Stats')
  const { data: friend } = trpc.friends.getFriend.useQuery({ friendId })
  const { data: profile } = trpc.profile.getProfile.useQuery()
  const {
    data,
    isLoading: queryIsLoading,
    isError,
    refetch,
  } = trpc.friends.getStats.useQuery({ friendId })

  const emphasizedParticipantIds =
    friend?.friendUserId && profile?.id
      ? [profile.id, friend.friendUserId]
      : undefined

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-muted-foreground">{t('error')}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const sections = (data ?? []).filter(
    (stats) =>
      stats.aggregateMetrics.totalCount > 0 ||
      stats.categoryBreakdown.length > 0,
  )

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-sm text-muted-foreground">
            {t('emptyState')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {sections.map((stats) => (
        <FriendCurrencyStatsSection
          key={stats.currency.code || stats.currency.symbol}
          stats={stats}
          emphasizedParticipantIds={emphasizedParticipantIds}
        />
      ))}
    </div>
  )
}
