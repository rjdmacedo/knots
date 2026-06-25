'use client'

import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { CurrencyBalance } from '@/lib/friend-balances'
import { trpc } from '@/trpc/client'
import { GroupType } from '@prisma/client'
import { TRPCClientError } from '@trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSpinDelay } from 'spin-delay'
import { FriendBalancesActions } from './friend-balances-actions'

type Props = {
  friendId: string
}

export function FriendBalanceDetail({ friendId }: Props) {
  const t = useTranslations('Friends.BalanceDetail')
  const t_expenses = useTranslations('Friends.Expenses')
  const {
    data,
    isLoading: queryIsLoading,
    isError,
    error,
    refetch,
  } = trpc.friends.getBalanceDetail.useQuery({ friendId })

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (isError) {
    // Handle "not connected" case specifically
    const isNotConnected =
      error instanceof TRPCClientError &&
      error.message === 'Friend is not connected.'

    if (isNotConnected) {
      return (
        <div className="flex flex-col gap-6">
          <div>
            <Link
              href="/friends"
              className="text-sm text-muted-foreground hover:underline"
            >
              ← {t('backToFriends')}
            </Link>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8">
              <p className="font-medium">{t('notConnectedTitle')}</p>
              <p className="text-sm text-muted-foreground text-center">
                {t('notConnectedDescription')}
              </p>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { balances, sharedGroupCount, settlements } = data

  return (
    <>
      {sharedGroupCount === 0 ? (
        <EmptyState name={data.friend.name} />
      ) : (
        <>
          <FriendBalancesActions
            friendId={friendId}
            friendName={data.friend.name}
            friendUserId={data.friend.friendUserId!}
            currentUserId={data.currentUserId}
            balances={balances}
            settlements={settlements}
          />
          <TotalBalanceCard balances={balances} />
          <GroupBreakdownCard balances={balances} friendId={friendId} />
        </>
      )}
    </>
  )
}

function EmptyState({ name }: { name: string }) {
  const t = useTranslations('Friends.BalanceDetail')

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-8">
        <p className="font-medium">{t('emptyTitle')}</p>
        <p className="text-sm text-muted-foreground text-center">
          {t('emptyDescription', { name })}
        </p>
      </CardContent>
    </Card>
  )
}

function TotalBalanceCard({ balances }: { balances: CurrencyBalance[] }) {
  const t = useTranslations('Friends.BalanceDetail')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('totalBalance')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">
          {balances.length === 0 ||
          balances.every((b) => b.totalAmount === 0) ? (
            <span className="text-sm text-muted-foreground">
              {t('emptyTitle')}
            </span>
          ) : (
            balances.map((b) => (
              <div
                key={b.currency.code || b.currency.symbol}
                className="text-lg font-semibold"
              >
                <Money
                  currency={b.currency}
                  amount={b.totalAmount}
                  colored
                  bold
                />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function GroupBreakdownCard({
  balances,
  friendId,
}: {
  balances: CurrencyBalance[]
  friendId: string
}) {
  const t = useTranslations('Friends.BalanceDetail')
  const t_expenses = useTranslations('Friends.Expenses')

  const allGroups = balances.flatMap((b) =>
    b.groups.map((g) => ({ ...g, currency: b.currency })),
  )

  if (allGroups.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('groupBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {allGroups.map((group) => (
            <div
              key={group.groupId}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {group.groupType === GroupType.DYAD
                    ? t_expenses('directExpenses')
                    : group.groupName}
                </span>
                <Link
                  href={
                    group.groupType === GroupType.DYAD
                      ? `/friends/${friendId}/expenses`
                      : `/groups/${group.groupSlug}/balances`
                  }
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {group.groupType === GroupType.DYAD
                    ? t_expenses('viewExpenses')
                    : t('viewGroupBalances')}
                </Link>
              </div>
              <Money currency={group.currency} amount={group.amount} colored />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-20" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {Array(3)
              .fill(undefined)
              .map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
