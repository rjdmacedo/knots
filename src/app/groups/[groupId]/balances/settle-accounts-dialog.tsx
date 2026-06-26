'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { handleAltEnterKeyDown } from '@/lib/alt-enter-submit'
import { Currency } from '@/lib/currency'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  formatCurrency,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Creditor = {
  from: string
  to: string
  amount: number
  groupId?: string
  groupLabel?: string
  displayName?: string
}

type Participant = {
  id: string
  name: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId?: string
  creditors: Creditor[]
  participants: Participant[]
  currency: Currency
  preselectedCreditorId?: string
  onSuccess?: () => void
}

function formatAmountForInput(amountMinor: number, currency: Currency) {
  return amountAsDecimal(amountMinor, currency, true).toFixed(
    currency.decimal_digits,
  )
}

function parseAmountInput(value: string, currency: Currency) {
  const normalized = value
    .replace(/^\s*-/, '_')
    .replace(/[.,]/, '#')
    .replace(/[-.,]/g, '')
    .replace(/_/, '-')
    .replace(/#/, '.')
    .replace(/[^-\d.]/g, '')

  const amount = Number(normalized)
  if (Number.isNaN(amount) || amount <= 0) {
    return null
  }

  return amountAsMinorUnits(amount, currency)
}

export function SettleAccountsDialog({
  open,
  onOpenChange,
  groupId,
  creditors,
  participants,
  currency,
  preselectedCreditorId,
  onSuccess,
}: Props) {
  const t = useTranslations('Balances.Actions')
  const locale = useLocale()
  const utils = trpc.useUtils()

  const [selectedCreditorId, setSelectedCreditorId] = useState('')
  const [amountInput, setAmountInput] = useState('')

  const { mutate: recordSettlement, isPending } =
    trpc.groups.balances.recordSettlement.useMutation({
      onSuccess: () => {
        utils.groups.balances.invalidate()
        utils.groups.expenses.invalidate()
        onSuccess?.()
        toast.success(t('settlementRecorded'))
        onOpenChange(false)
      },
      onError: () => {
        toast.error(t('settlementFailed'))
      },
    })

  const getCreditorKey = (creditor: Creditor) => creditor.groupId ?? creditor.to

  useEffect(() => {
    if (!open) return

    const nextCreditorKey =
      preselectedCreditorId &&
      creditors.some(
        (creditor) => getCreditorKey(creditor) === preselectedCreditorId,
      )
        ? preselectedCreditorId
        : creditors[0]
          ? getCreditorKey(creditors[0])
          : ''

    setSelectedCreditorId(nextCreditorKey)

    const debt = creditors.find(
      (creditor) => getCreditorKey(creditor) === nextCreditorKey,
    )
    setAmountInput(debt ? formatAmountForInput(debt.amount, currency) : '')
  }, [open, preselectedCreditorId, creditors, currency])

  const selectedCreditor = creditors.find(
    (creditor) => getCreditorKey(creditor) === selectedCreditorId,
  )
  const selectedParticipant = participants.find(
    (participant) => participant.id === selectedCreditor?.to,
  )
  const selectedCreditorName =
    selectedCreditor?.displayName ?? selectedParticipant?.name ?? 'Unknown'
  const parsedAmount = parseAmountInput(amountInput, currency)

  const handleCreditorChange = (creditorKey: string) => {
    setSelectedCreditorId(creditorKey)
    const debt = creditors.find(
      (creditor) => getCreditorKey(creditor) === creditorKey,
    )
    setAmountInput(debt ? formatAmountForInput(debt.amount, currency) : '')
  }

  const canSubmit =
    Boolean(selectedCreditorId) && parsedAmount !== null && !isPending

  const handleConfirm = () => {
    if (!selectedCreditor || parsedAmount === null) return

    const settlementGroupId = selectedCreditor.groupId ?? groupId ?? null

    recordSettlement({
      groupId: settlementGroupId,
      fromUserId: selectedCreditor.from,
      toUserId: selectedCreditor.to,
      amount: parsedAmount,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) =>
          handleAltEnterKeyDown(event, handleConfirm, !canSubmit)
        }
      >
        <DialogHeader>
          <DialogTitle>{t('settleTitle')}</DialogTitle>
          <DialogDescription>{t('settleDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Label>{t('selectCreditor')}</Label>
          <RadioGroup
            value={selectedCreditorId}
            onValueChange={handleCreditorChange}
          >
            {creditors.map((creditor) => {
              const participant = participants.find(
                (participant) => participant.id === creditor.to,
              )
              const creditorKey = getCreditorKey(creditor)
              const creditorName =
                creditor.displayName ?? participant?.name ?? 'Unknown'
              return (
                <div key={creditorKey} className="flex items-center gap-3">
                  <RadioGroupItem value={creditorKey} id={creditorKey} />
                  <Label
                    htmlFor={creditorKey}
                    className="font-normal cursor-pointer"
                  >
                    {creditor.groupLabel ? `${creditor.groupLabel} – ` : ''}
                    {creditorName} –{' '}
                    {formatCurrency(currency, creditor.amount, locale)}
                  </Label>
                </div>
              )
            })}
          </RadioGroup>

          {selectedCreditor && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="settle-amount">{t('settleAmountLabel')}</Label>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">
                  {currency.code}
                </span>
                <Input
                  id="settle-amount"
                  type="text"
                  inputMode="decimal"
                  className="max-w-[140px]"
                  value={amountInput}
                  onChange={(event) => {
                    const value = event.target.value
                      .replace(/^\s*-/, '_')
                      .replace(/[.,]/, '#')
                      .replace(/[-.,]/g, '')
                      .replace(/_/, '-')
                      .replace(/#/, '.')
                      .replace(/[^-\d.]/g, '')
                    setAmountInput(value)
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settleAmountHint', {
                  amount: formatCurrency(
                    currency,
                    selectedCreditor.amount,
                    locale,
                  ),
                })}
              </p>
            </div>
          )}

          {selectedCreditor && parsedAmount !== null && (
            <p className="text-sm text-muted-foreground">
              {t('confirmSettle', {
                amount: formatCurrency(currency, parsedAmount, locale),
                name: selectedCreditorName,
              })}
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2">
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('recording')}
              </>
            ) : (
              t('recordPayment')
            )}
          </Button>
          <DialogClose render={<Button variant="secondary" />}>
            {t('cancel')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
