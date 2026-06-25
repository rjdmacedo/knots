'use client'

import { RequestPaymentDialog } from '@/app/groups/[groupSlug]/balances/request-payment-dialog'
import { SettleAccountsDialog } from '@/app/groups/[groupSlug]/balances/settle-accounts-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Currency } from '@/lib/currency'
import { CurrencyBalance, FriendSettlement } from '@/lib/friend-balances'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { GroupType } from '@prisma/client'
import { Banknote, Mail } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type Props = {
  friendId: string
  friendName: string
  friendUserId: string
  currentUserId: string
  balances: CurrencyBalance[]
  settlements: FriendSettlement[]
}

function getGroupLabel(
  settlement: FriendSettlement,
  directExpensesLabel: string,
) {
  return settlement.groupType === GroupType.DYAD
    ? directExpensesLabel
    : settlement.groupName
}

export function FriendBalancesActions({
  friendId,
  friendName,
  friendUserId,
  currentUserId,
  balances,
  settlements,
}: Props) {
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

  if (settlementsByCurrency.length === 0) {
    return null
  }

  return (
    <>
      {settlementsByCurrency.map(({ currency, items }) => {
        const currencyBalance = balances.find(
          (balance) =>
            (balance.currency.code || balance.currency.symbol) ===
            (currency.code || currency.symbol),
        )

        if (!currencyBalance || currencyBalance.totalAmount === 0) {
          return null
        }

        return (
          <FriendBalancesActionsCard
            key={currency.code || currency.symbol}
            friendId={friendId}
            friendName={friendName}
            friendUserId={friendUserId}
            currentUserId={currentUserId}
            currency={currency}
            netBalance={currencyBalance.totalAmount}
            settlements={items}
          />
        )
      })}
    </>
  )
}

type CardProps = {
  friendId: string
  friendName: string
  friendUserId: string
  currentUserId: string
  currency: Currency
  netBalance: number
  settlements: FriendSettlement[]
}

function FriendBalancesActionsCard({
  friendId,
  friendName,
  friendUserId,
  currentUserId,
  currency,
  netBalance,
  settlements,
}: CardProps) {
  const t = useTranslations('Balances.Actions')
  const t_expenses = useTranslations('Friends.Expenses')
  const locale = useLocale()
  const utils = trpc.useUtils()

  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false)

  const getParticipantName = (userId: string) => {
    if (userId === friendUserId) return friendName
    return 'You'
  }

  const owedToMe = settlements
    .filter((settlement) => settlement.to === currentUserId)
    .map((settlement) => ({
      from: settlement.from,
      to: settlement.to,
      amount: settlement.amount,
      groupId: settlement.groupId,
      groupLabel: getGroupLabel(settlement, t_expenses('directExpenses')),
      displayName: getParticipantName(settlement.from),
    }))

  const iOwe = settlements
    .filter((settlement) => settlement.from === currentUserId)
    .map((settlement) => ({
      from: settlement.from,
      to: settlement.to,
      amount: settlement.amount,
      groupId: settlement.groupId,
      groupLabel: getGroupLabel(settlement, t_expenses('directExpenses')),
      displayName: getParticipantName(settlement.to),
    }))

  const friendOwesYou = netBalance > 0
  const youOweFriend = netBalance < 0

  const summaryLine = friendOwesYou
    ? t('youAreOwed', {
        name: friendName,
        amount: formatCurrency(currency, netBalance, locale),
      })
    : t('youOwe', {
        name: friendName,
        amount: formatCurrency(currency, Math.abs(netBalance), locale),
      })

  const participants = [
    { id: currentUserId, name: getParticipantName(currentUserId) },
    { id: friendUserId, name: friendName },
  ]

  const invalidateFriendBalances = () => {
    utils.friends.getBalanceDetail.invalidate({ friendId })
    utils.friends.listWithBalances.invalidate()
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-medium">{summaryLine}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!friendOwesYou || owedToMe.length === 0}
            onClick={() => setRequestDialogOpen(true)}
          >
            <Mail className="size-4" data-icon="inline-start" />
            {t('request')}
          </Button>
          <Button
            variant="outline"
            disabled={!youOweFriend || iOwe.length === 0}
            onClick={() => setSettleDialogOpen(true)}
          >
            <Banknote className="size-4" data-icon="inline-start" />
            {t('settle')}
          </Button>
        </div>
      </CardContent>

      <RequestPaymentDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        owedToMe={owedToMe}
        participants={participants}
        currency={currency}
        onSuccess={invalidateFriendBalances}
      />
      <SettleAccountsDialog
        open={settleDialogOpen}
        onOpenChange={setSettleDialogOpen}
        creditors={iOwe}
        participants={participants}
        currency={currency}
        onSuccess={invalidateFriendBalances}
      />
    </Card>
  )
}
