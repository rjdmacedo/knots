'use client'

import { useFriendContext } from '@/app/friends/[username]/friend-context'
import { RequestPaymentDialog } from '@/app/groups/[groupId]/balances/request-payment-dialog'
import { SettleAccountsDialog } from '@/app/groups/[groupId]/balances/settle-accounts-dialog'
import {
  EXPENSE_DATE_GROUPS,
  type ExpenseDateGroup,
  getExpenseDateGroup,
} from '@/app/groups/[groupId]/expenses/grouped-expense-cards'
import { Money } from '@/components/money'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Currency } from '@/lib/currency'
import type { CurrencyBalance, FriendSettlement } from '@/lib/friend-balances'
import type { TimelineEntry } from '@/lib/friend-timeline'
import { trpc } from '@/trpc/client'
import dayjs from 'dayjs'
import { Banknote, Layers, Loader2, Mail, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSpinDelay } from 'spin-delay'
import { DirectExpenseDialog } from './direct-expense-dialog'
import { FriendTimeline } from './friend-timeline'

type Props = {
  friendId: string
}

export function FriendTimelineView({ friendId }: Props) {
  const t = useTranslations('Friends.Timeline')
  const tGroups = useTranslations('Friends.Timeline.groups')
  const { username } = useFriendContext()

  const [directExpenseDialogOpen, setDirectExpenseDialogOpen] = useState(false)

  const {
    data,
    isLoading: queryIsLoading,
    isError,
    refetch,
  } = trpc.friends.getTimeline.useQuery({ friendId })

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  const groupedEntries = useMemo(() => {
    if (!data?.entries) return null
    return groupTimelineEntriesByDate(
      data.entries as unknown as TimelineEntry[],
    )
  }, [data?.entries])

  if (isLoading) {
    return <TimelineSkeleton />
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

  const { friend, currentUserId, balances, settlements } = data
  const entries = data.entries as unknown as TimelineEntry[]

  return (
    <div className="flex flex-col gap-4">
      {/* Header: Balance summary + Solicitar / Liquidar contas */}
      <TimelineHeader
        friendId={friendId}
        friendName={friend.name}
        friendUserId={friend.friendUserId!}
        currentUserId={currentUserId}
        balances={balances}
        settlements={settlements}
      />

      {/* Timeline feed grouped by date */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t('empty')}
        </p>
      ) : (
        <div className="flex flex-col">
          {Object.values(EXPENSE_DATE_GROUPS).map((dateGroup) => {
            const groupItems = groupedEntries?.[dateGroup]
            if (!groupItems || groupItems.length === 0) return null

            return (
              <div key={dateGroup}>
                <div className="text-xs py-2 font-semibold sticky top-0 z-10 bg-background px-4 text-muted-foreground uppercase tracking-wide">
                  {tGroups(dateGroup)}
                </div>
                <FriendTimeline
                  entries={groupItems}
                  currentUserId={currentUserId}
                  friendUsername={username}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Add expense FAB */}
      <div className="sticky bottom-6 flex justify-end pointer-events-none">
        <Button
          size="lg"
          className="rounded-full shadow-lg pointer-events-auto"
          onClick={() => setDirectExpenseDialogOpen(true)}
        >
          <Plus className="size-5" data-icon="inline-start" />
          {t('addExpense')}
        </Button>
      </div>

      {/* Direct expense dialog */}
      <DirectExpenseDialog
        open={directExpenseDialogOpen}
        onOpenChange={setDirectExpenseDialogOpen}
        friendId={friendId}
        friendName={friend.name}
        friendUserId={friend.friendUserId!}
        currentUserId={currentUserId}
      />
    </div>
  )
}

// ─── Header with balance summary + action buttons ─────────────────────────────

type TimelineHeaderProps = {
  friendId: string
  friendName: string
  friendUserId: string
  currentUserId: string
  balances: CurrencyBalance[]
  settlements: FriendSettlement[]
}

function TimelineHeader({
  friendId,
  friendName,
  friendUserId,
  currentUserId,
  balances,
  settlements,
}: TimelineHeaderProps) {
  const t = useTranslations('Friends.Timeline')
  const tActions = useTranslations('Balances.Actions')
  const tSettleAll = useTranslations('Friends.SettleAll')
  const utils = trpc.useUtils()

  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false)
  const [settleAllDialogOpen, setSettleAllDialogOpen] = useState(false)

  const settlementsByCurrency = useMemo(() => {
    const map = new Map<
      string,
      { currency: Currency; items: FriendSettlement[] }
    >()

    for (const settlement of settlements) {
      const key = settlement.currency.code || settlement.currency.symbol
      const existing = map.get(key)

      if (existing) {
        existing.items.push(settlement)
      } else {
        map.set(key, { currency: settlement.currency, items: [settlement] })
      }
    }

    return Array.from(map.values())
  }, [settlements])

  const nonZeroBalances = balances.filter((b) => b.totalAmount !== 0)

  // Determine if friend owes current user or vice versa (for button visibility)
  const hasPositiveBalance = nonZeroBalances.some((b) => b.totalAmount > 0)
  const hasNegativeBalance = nonZeroBalances.some((b) => b.totalAmount < 0)

  // Check if "Liquidar tudo" button should be visible:
  // 2+ buckets with non-zero balance in any currency
  const settleAllCurrencies = useMemo(() => {
    const result: Array<{ currency: Currency; bucketCount: number }> = []
    for (const balance of balances) {
      const nonZeroBuckets = balance.groups.filter((g) => g.amount !== 0)
      if (nonZeroBuckets.length >= 2) {
        result.push({
          currency: balance.currency,
          bucketCount: nonZeroBuckets.length,
        })
      }
    }
    return result
  }, [balances])

  const showSettleAll = settleAllCurrencies.length > 0

  const invalidateTimeline = () => {
    utils.friends.getTimeline.invalidate({ friendId })
    utils.friends.getBalanceDetail.invalidate({ friendId })
    utils.friends.listWithBalances.invalidate()
  }

  const { mutate: settleAllMutate, isPending: isSettlingAll } =
    trpc.friends.settleAll.useMutation({
      onSuccess: () => {
        invalidateTimeline()
        toast.success(tSettleAll('success'))
        setSettleAllDialogOpen(false)
      },
      onError: () => {
        toast.error(tSettleAll('error'))
        setSettleAllDialogOpen(false)
      },
    })

  const getParticipantName = (userId: string) => {
    if (userId === friendUserId) return friendName
    return 'You'
  }

  const getGroupLabel = (settlement: FriendSettlement) => {
    if (settlement.groupName) return settlement.groupName
    if (settlement.groupId === null) return tSettleAll('directBucket')
    return undefined
  }

  const owedToMe = settlements
    .filter((settlement) => settlement.to === currentUserId)
    .map((settlement) => ({
      from: settlement.from,
      to: settlement.to,
      amount: settlement.amount,
      groupId: settlement.groupId ?? undefined,
      groupLabel: getGroupLabel(settlement),
      displayName: getParticipantName(settlement.from),
    }))

  const iOwe = settlements
    .filter((settlement) => settlement.from === currentUserId)
    .map((settlement) => ({
      from: settlement.from,
      to: settlement.to,
      amount: settlement.amount,
      groupId: settlement.groupId ?? undefined,
      groupLabel: getGroupLabel(settlement),
      displayName: getParticipantName(settlement.to),
    }))

  const participants = [
    { id: currentUserId, name: getParticipantName(currentUserId) },
    { id: friendUserId, name: friendName },
  ]

  if (nonZeroBalances.length === 0) {
    return null
  }

  // Pick the first currency for dialogs
  const primaryCurrency = settlementsByCurrency[0]?.currency

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        {/* Balance summary per currency — full-sentence copy */}
        <div className="flex flex-col gap-1">
          {nonZeroBalances.map((b) => (
            <p
              key={b.currency.code || b.currency.symbol}
              className="text-base font-medium"
            >
              {b.totalAmount > 0 ? (
                <>
                  {t('friendOwesYou', { name: friendName, amount: '' }).replace(
                    /\s*$/,
                    '',
                  )}{' '}
                  <Money
                    currency={b.currency}
                    amount={Math.abs(b.totalAmount)}
                    colored
                    bold
                  />
                </>
              ) : (
                <>
                  {t('youOweFriend', { name: friendName, amount: '' }).replace(
                    /\s*$/,
                    '',
                  )}{' '}
                  <Money
                    currency={b.currency}
                    amount={Math.abs(b.totalAmount)}
                    colored
                    bold
                  />
                </>
              )}
            </p>
          ))}
        </div>

        {/* Action buttons: Solicitar (Request) + Liquidar contas (Settle) + Liquidar tudo */}
        <div className="flex flex-wrap gap-2">
          {hasPositiveBalance && (
            <Button
              variant="outline"
              disabled={owedToMe.length === 0}
              onClick={() => setRequestDialogOpen(true)}
            >
              <Mail className="size-4" data-icon="inline-start" />
              {tActions('request')}
            </Button>
          )}
          {hasNegativeBalance && (
            <Button
              variant="outline"
              disabled={iOwe.length === 0}
              onClick={() => setSettleDialogOpen(true)}
            >
              <Banknote className="size-4" data-icon="inline-start" />
              {tActions('settle')}
            </Button>
          )}
          {showSettleAll && (
            <AlertDialog
              open={settleAllDialogOpen}
              onOpenChange={setSettleAllDialogOpen}
            >
              <AlertDialogTrigger
                render={
                  <Button variant="outline" disabled={isSettlingAll}>
                    {isSettlingAll ? (
                      <Loader2
                        className="size-4 animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Layers className="size-4" data-icon="inline-start" />
                    )}
                    {tSettleAll('button')}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tSettleAll('title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tSettleAll('description', {
                      name: friendName,
                      currency: settleAllCurrencies[0]?.currency.code ?? '',
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tActions('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isSettlingAll}
                    onClick={() => {
                      for (const { currency } of settleAllCurrencies) {
                        settleAllMutate({
                          friendId,
                          currency: currency.code || currency.symbol,
                        })
                      }
                    }}
                  >
                    {isSettlingAll
                      ? tSettleAll('settling')
                      : tSettleAll('confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>

      {/* Dialogs */}
      {primaryCurrency && (
        <>
          <RequestPaymentDialog
            open={requestDialogOpen}
            onOpenChange={setRequestDialogOpen}
            owedToMe={owedToMe}
            participants={participants}
            currency={primaryCurrency}
            onSuccess={invalidateTimeline}
          />
          <SettleAccountsDialog
            open={settleDialogOpen}
            onOpenChange={setSettleDialogOpen}
            creditors={iOwe}
            participants={participants}
            currency={primaryCurrency}
            onSuccess={invalidateTimeline}
          />
        </>
      )}
    </Card>
  )
}

// ─── Date grouping ───────────────────────────────────────────────────────────

function getTimelineEntryDate(entry: TimelineEntry): Date {
  switch (entry.type) {
    case 'GROUP_SUMMARY':
      return entry.activityDate
    case 'EXPENSE':
      return entry.expenseDate
    case 'PAYMENT':
      return entry.expenseDate
  }
}

function groupTimelineEntriesByDate(
  entries: TimelineEntry[],
): Partial<Record<ExpenseDateGroup, TimelineEntry[]>> {
  const today = dayjs()
  return entries.reduce(
    (result: Partial<Record<ExpenseDateGroup, TimelineEntry[]>>, entry) => {
      const group = getExpenseDateGroup(
        dayjs(getTimelineEntryDate(entry)),
        today,
      )
      result[group] = result[group] ?? []
      result[group].push(entry)
      return result
    },
    {},
  )
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}
