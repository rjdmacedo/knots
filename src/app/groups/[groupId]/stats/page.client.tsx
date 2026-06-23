'use client'

import { AggregateMetrics } from '@/app/groups/[groupId]/stats/aggregate-metrics'
import { CategoryBreakdown } from '@/app/groups/[groupId]/stats/category-breakdown'
import { DailyAverage } from '@/app/groups/[groupId]/stats/daily-average'
import { ExpenseDistribution } from '@/app/groups/[groupId]/stats/expense-distribution'
import { MonthOverMonth } from '@/app/groups/[groupId]/stats/month-over-month'
import { NetBalances } from '@/app/groups/[groupId]/stats/net-balances'
import { PaidVsShare } from '@/app/groups/[groupId]/stats/paid-vs-share'
import { ParticipantRanking } from '@/app/groups/[groupId]/stats/participant-ranking'
import { Reimbursements } from '@/app/groups/[groupId]/stats/reimbursements'
import { SpendingOverTime } from '@/app/groups/[groupId]/stats/spending-over-time'
import { Totals } from '@/app/groups/[groupId]/stats/totals'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

export function TotalsPageClient() {
  const t = useTranslations('Stats')
  const { groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)

  const participantId =
    activeUser && activeUser !== 'None' ? activeUser : undefined

  const { data, isLoading, isError, refetch } = trpc.groups.stats.get.useQuery({
    groupId,
    participantId,
  })

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

  if (isLoading || !data || !group) {
    return (
      <div className="flex flex-col gap-4">
        {/* Totals skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="flex flex-col space-y-4">
            {[0, 1, 2].map((index) => (
              <div key={index}>
                <Skeleton className="mt-1 h-3 w-48" />
                <Skeleton className="mt-3 h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
        {/* Category breakdown skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        {/* Participant ranking skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Expense distribution skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        {/* Spending over time skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        {/* Month-over-month skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-48" />
          </CardContent>
        </Card>
        {/* Daily average skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-24" />
          </CardContent>
        </Card>
        {/* Aggregate metrics skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="mt-2 h-5 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Net balances skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Paid vs share skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currency = getCurrencyFromGroup(group)

  const {
    categoryBreakdown,
    participantRanking,
    expenseDistribution,
    spendingOverTime,
    monthOverMonth,
    dailyAverage,
    aggregateMetrics,
    netBalances,
    paidVsSharePercentages,
    reimbursements,
  } = data

  // Check if group has no non-reimbursement expenses
  const hasNoData =
    aggregateMetrics.totalCount === 0 && categoryBreakdown.length === 0

  if (hasNoData) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('Totals.title')}</CardTitle>
            <CardDescription>{t('Totals.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-4">
            <Totals />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-sm text-muted-foreground">
              {t('emptyState')}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Existing Totals */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Totals.title')}</CardTitle>
          <CardDescription>{t('Totals.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Totals />
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <CategoryBreakdown data={categoryBreakdown} currency={currency} />

      {/* Participant Ranking */}
      <ParticipantRanking ranking={participantRanking} currency={currency} />

      {/* Expense Distribution */}
      <ExpenseDistribution data={expenseDistribution} currency={currency} />

      {/* Reimbursements */}
      <Reimbursements data={reimbursements} currency={currency} />

      {/* Spending Over Time */}
      <SpendingOverTime data={spendingOverTime} currency={currency} />

      {/* Month-over-Month */}
      <MonthOverMonth data={monthOverMonth} currency={currency} />

      {/* Daily Average */}
      <DailyAverage dailyAverage={dailyAverage} currency={currency} />

      {/* Aggregate Metrics */}
      <AggregateMetrics data={aggregateMetrics} currency={currency} />

      {/* Net Balances */}
      <NetBalances netBalances={netBalances} currency={currency} />

      {/* Paid vs Share */}
      <PaidVsShare
        paidVsSharePercentages={paidVsSharePercentages}
        currency={currency}
      />
    </div>
  )
}
