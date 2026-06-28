'use client'
import { Money } from '@/components/money'
import { getBalances } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { useGroupParticipantId } from '@/lib/hooks'
import { has } from 'lodash-es'
import { useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

type Props = {
  currency: Currency
  expense: Parameters<typeof getBalances>[0][number]
}

export function ActiveUserBalance({ currency, expense }: Props) {
  const t = useTranslations('ExpenseCard')
  const { group } = useCurrentGroup()
  const participantId = useGroupParticipantId(group?.participants)

  if (!participantId) {
    return null
  }

  const balances = getBalances([expense])
  let fmtBalance = <>{t('notInvolved')}</>
  if (has(balances, participantId)) {
    const balance = balances[participantId]
    let balanceDetail = <></>
    if (balance.paid > 0 && balance.paidFor > 0) {
      balanceDetail = (
        <>
          {' ('}
          <Money {...{ currency, amount: balance.paid }} />
          {' - '}
          <Money {...{ currency, amount: balance.paidFor }} />
          {')'}
        </>
      )
    }
    fmtBalance = (
      <>
        {t('yourBalance')}{' '}
        <Money {...{ currency, amount: balance.total }} bold colored />
        {balanceDetail}
      </>
    )
  }
  return <div className="text-xs text-muted-foreground">{fmtBalance}</div>
}
