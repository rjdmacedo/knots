'use client'

import { RequestPaymentDialog } from '@/app/groups/[groupId]/balances/request-payment-dialog'
import { SettleAccountsDialog } from '@/app/groups/[groupId]/balances/settle-accounts-dialog'
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
import type { Currency } from '@/lib/currency'
import type { CurrencyBalance, FriendSettlement } from '@/lib/friend-balances'
import { trpc } from '@/trpc/client'
import { Banknote, Layers, Loader2, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

type Props = {
  friendId: string
  friendName: string
  friendUserId: string
  currentUserId: string
  balances: CurrencyBalance[]
  settlements: FriendSettlement[]
}

export function FriendBalanceActions({
  friendId,
  friendName,
  friendUserId,
  currentUserId,
  balances,
  settlements,
}: Props) {
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
  const hasPositiveBalance = nonZeroBalances.some((b) => b.totalAmount > 0)
  const hasNegativeBalance = nonZeroBalances.some((b) => b.totalAmount < 0)

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

  const invalidateBalances = () => {
    utils.friends.getTimeline.invalidate({ friendId })
    utils.friends.getBalanceDetail.invalidate({ friendId })
    utils.friends.listWithBalances.invalidate()
  }

  const { mutate: settleAllMutate, isPending: isSettlingAll } =
    trpc.friends.settleAll.useMutation({
      onSuccess: () => {
        invalidateBalances()
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

  const primaryCurrency = settlementsByCurrency[0]?.currency

  if (nonZeroBalances.length === 0) {
    return null
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasPositiveBalance ? (
          <Button
            variant="outline"
            disabled={owedToMe.length === 0}
            onClick={() => setRequestDialogOpen(true)}
          >
            <Mail className="size-4" data-icon="inline-start" />
            {tActions('request')}
          </Button>
        ) : null}
        {hasNegativeBalance ? (
          <Button
            variant="outline"
            disabled={iOwe.length === 0}
            onClick={() => setSettleDialogOpen(true)}
          >
            <Banknote className="size-4" data-icon="inline-start" />
            {tActions('settle')}
          </Button>
        ) : null}
        {showSettleAll ? (
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
        ) : null}
      </div>

      {primaryCurrency ? (
        <>
          <RequestPaymentDialog
            open={requestDialogOpen}
            onOpenChange={setRequestDialogOpen}
            owedToMe={owedToMe}
            participants={participants}
            currency={primaryCurrency}
            onSuccess={invalidateBalances}
          />
          <SettleAccountsDialog
            open={settleDialogOpen}
            onOpenChange={setSettleDialogOpen}
            creditors={iOwe}
            participants={participants}
            currency={primaryCurrency}
            onSuccess={invalidateBalances}
          />
        </>
      ) : null}
    </>
  )
}
