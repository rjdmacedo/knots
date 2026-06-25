'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { Banknote, Mail } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { RequestPaymentDialog } from './request-payment-dialog'
import { SettleAccountsDialog } from './settle-accounts-dialog'

type Props = {
  groupId: string
  reimbursements: Reimbursement[]
  participants: { id: string; name: string }[]
  currency: Currency
  currentUserId: string
}

export function BalancesActions({
  groupId,
  reimbursements,
  participants,
  currency,
  currentUserId,
}: Props) {
  const t = useTranslations('Balances.Actions')
  const locale = useLocale()
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false)

  const owedToMe = reimbursements.filter((r) => r.to === currentUserId)
  const iOwe = reimbursements.filter((r) => r.from === currentUserId)

  const getParticipantName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? 'Unknown'

  const summaryLine = (() => {
    if (owedToMe.length > 0) {
      const largest = owedToMe.reduce((max, r) =>
        r.amount > max.amount ? r : max,
      )
      return t('youAreOwed', {
        name: getParticipantName(largest.from),
        amount: formatCurrency(currency, largest.amount, locale),
      })
    }
    if (iOwe.length > 0) {
      const largest = iOwe.reduce((max, r) => (r.amount > max.amount ? r : max))
      return t('youOwe', {
        name: getParticipantName(largest.to),
        amount: formatCurrency(currency, largest.amount, locale),
      })
    }
    return t('allSettled')
  })()

  return (
    <Card size="sm" className="mb-4">
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-medium">{summaryLine}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={owedToMe.length === 0}
            onClick={() => setRequestDialogOpen(true)}
          >
            <Mail className="size-4" data-icon="inline-start" />
            {t('request')}
          </Button>
          <Button
            variant="outline"
            disabled={iOwe.length === 0}
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
        groupId={groupId}
        owedToMe={owedToMe}
        participants={participants}
        currency={currency}
      />
      <SettleAccountsDialog
        open={settleDialogOpen}
        onOpenChange={setSettleDialogOpen}
        groupId={groupId}
        creditors={iOwe}
        participants={participants}
        currency={currency}
      />
    </Card>
  )
}
