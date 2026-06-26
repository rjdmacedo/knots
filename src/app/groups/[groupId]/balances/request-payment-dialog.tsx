'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { handleAltEnterKeyDown } from '@/lib/alt-enter-submit'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type PaymentRequest = Reimbursement & {
  groupId?: string
  groupLabel?: string
  displayName?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId?: string
  owedToMe: PaymentRequest[]
  participants: { id: string; name: string }[]
  currency: Currency
  onSuccess?: () => void
}

export function RequestPaymentDialog({
  open,
  onOpenChange,
  groupId,
  owedToMe,
  participants,
  currency,
  onSuccess,
}: Props) {
  const t = useTranslations('Balances.Actions')
  const locale = useLocale()
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [message, setMessage] = useState('')

  const getRequestKey = (request: PaymentRequest) =>
    request.groupId ?? request.from

  useEffect(() => {
    if (!open) return
    setSelectedKey(owedToMe[0] ? getRequestKey(owedToMe[0]) : '')
  }, [open, owedToMe])

  const requestPayment = trpc.groups.balances.requestPayment.useMutation({
    onSuccess: () => {
      onSuccess?.()
      toast.success(t('requestSent'))
      onOpenChange(false)
      setSelectedKey('')
      setMessage('')
    },
    onError: () => {
      toast.error(t('requestFailed'))
    },
  })

  const getParticipantName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? 'Unknown'

  const selectedReimbursement = owedToMe.find(
    (request) => getRequestKey(request) === selectedKey,
  )

  const canSubmit = Boolean(selectedKey) && !requestPayment.isPending

  const handleSubmit = () => {
    if (!selectedReimbursement) return
    const requestGroupId = selectedReimbursement.groupId ?? groupId ?? null

    requestPayment.mutate({
      groupId: requestGroupId,
      fromUserId: selectedReimbursement.from,
      toUserId: selectedReimbursement.to,
      amount: selectedReimbursement.amount,
      message: message || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) =>
          handleAltEnterKeyDown(event, handleSubmit, !canSubmit)
        }
      >
        <DialogHeader>
          <DialogTitle>{t('requestTitle')}</DialogTitle>
          <DialogDescription>{t('requestDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Label>{t('selectDebtor')}</Label>
          <RadioGroup value={selectedKey} onValueChange={setSelectedKey}>
            {owedToMe.map((request) => {
              const requestKey = getRequestKey(request)
              const debtorName =
                request.displayName ?? getParticipantName(request.from)
              return (
                <div key={requestKey} className="flex items-center gap-3">
                  <RadioGroupItem value={requestKey} id={requestKey} />
                  <Label
                    htmlFor={requestKey}
                    className="font-normal cursor-pointer"
                  >
                    {request.groupLabel ? `${request.groupLabel} – ` : ''}
                    {debtorName} –{' '}
                    {formatCurrency(currency, request.amount, locale)}
                  </Label>
                </div>
              )
            })}
          </RadioGroup>

          <div className="flex flex-col gap-2">
            <Label htmlFor="request-message">{t('message')}</Label>
            <Textarea
              id="request-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('messagePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {t('sendRequest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
