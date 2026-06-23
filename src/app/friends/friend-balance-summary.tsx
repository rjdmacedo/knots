'use client'

import { Money } from '@/components/money'
import type { CurrencyBalance } from '@/lib/friend-balances'
import { useTranslations } from 'next-intl'

type Props = {
  balances: CurrencyBalance[]
  friendName: string
}

export function FriendBalanceSummary({ balances, friendName }: Props) {
  const t = useTranslations('Friends.Balances')

  const nonZeroBalances = balances.filter((b) => b.totalAmount !== 0)

  if (nonZeroBalances.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('settled')}</span>
  }

  return (
    <div className="flex flex-col gap-0.5">
      {nonZeroBalances.map((b) => (
        <div key={b.currency.code || b.currency.symbol} className="text-xs">
          <span className="text-muted-foreground">
            {b.totalAmount > 0
              ? t('friendOwesYou', { name: friendName })
              : t('youOweFriend', { name: friendName })}
          </span>{' '}
          <Money
            currency={b.currency}
            amount={Math.abs(b.totalAmount)}
            colored
          />
        </div>
      ))}
    </div>
  )
}
