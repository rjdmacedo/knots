'use client'

import { FriendBalanceActions } from '@/app/friends/[username]/friend-balance-actions'
import { Money } from '@/components/money'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSpinDelay } from 'spin-delay'

type Props = {
  friendId: string
}

export function FriendBalancesView({ friendId }: Props) {
  const t = useTranslations('Friends.BalanceDetail')
  const tBalances = useTranslations('Friends.Balances')
  const tSettleAll = useTranslations('Friends.SettleAll')

  const {
    data,
    isLoading: queryIsLoading,
    isError,
    refetch,
  } = trpc.friends.getBalanceDetail.useQuery({ friendId })

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (isLoading) {
    return <BalancesSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  const { friend, balances, settlements, currentUserId } = data
  const nonZeroBalances = balances.filter((b) => b.totalAmount !== 0)

  if (nonZeroBalances.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {tBalances('settled')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {nonZeroBalances.map((balance) => (
        <Card key={balance.currency.code || balance.currency.symbol}>
          <CardHeader>
            <CardTitle>{t('totalBalance')}</CardTitle>
            <CardDescription>
              {balance.totalAmount > 0
                ? tBalances('friendOwesYou', { name: friend.name })
                : tBalances('youOweFriend', { name: friend.name })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-2xl font-bold">
              <Money
                currency={balance.currency}
                amount={Math.abs(balance.totalAmount)}
                colored
                bold
              />
            </p>

            {balance.groups.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('groupBreakdown')}</h3>
                <ul className="divide-y rounded-lg border">
                  {balance.groups.map((group) => (
                    <li
                      key={`${group.groupId ?? 'direct'}-${group.currency.code}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {group.groupName ?? tSettleAll('directBucket')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('groupBalance')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {group.groupId ? (
                          <Link
                            href={`/groups/${group.groupId}/balances`}
                            className="text-xs text-primary hover:underline"
                          >
                            {t('viewGroupBalances')}
                          </Link>
                        ) : null}
                        <Money
                          currency={group.currency}
                          amount={Math.abs(group.amount)}
                          colored
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <FriendBalanceActions
        friendId={friendId}
        friendName={friend.name}
        friendUserId={friend.friendUserId!}
        currentUserId={currentUserId}
        balances={balances}
        settlements={settlements}
      />
    </div>
  )
}

function BalancesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-10 w-48" />
    </div>
  )
}
