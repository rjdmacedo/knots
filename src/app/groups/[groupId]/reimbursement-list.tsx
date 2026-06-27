'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { buildPaymentCreatePrefill } from '@/lib/settlements'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Banknote, Loader2, Mail } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

type Props = {
  reimbursements: Reimbursement[]
  participants: { id: string; name: string }[]
  currency: Currency
  groupId: string
  groupName: string
  currentUserId?: string
}

export function ReimbursementList({
  reimbursements,
  participants,
  currency,
  groupId,
  groupName,
  currentUserId,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Balances.Reimbursements')

  if (reimbursements.length === 0) {
    return <p className="text-sm pb-6">{t('noImbursements')}</p>
  }

  const getParticipant = (id: string) => participants.find((p) => p.id === id)

  return (
    <div className="text-sm">
      {reimbursements.map((reimbursement, index) => (
        <ReimbursementRow
          key={index}
          reimbursement={reimbursement}
          getParticipant={getParticipant}
          currency={currency}
          locale={locale}
          groupId={groupId}
          groupName={groupName}
          currentUserId={currentUserId}
          t={t}
        />
      ))}
    </div>
  )
}

type ReimbursementRowProps = {
  reimbursement: Reimbursement
  getParticipant: (id: string) => { id: string; name: string } | undefined
  currency: Currency
  locale: string
  groupId: string
  groupName: string
  currentUserId?: string
  t: ReturnType<typeof useTranslations<'Balances.Reimbursements'>>
}

function ReimbursementRow({
  reimbursement,
  getParticipant,
  currency,
  locale,
  groupId,
  groupName,
  currentUserId,
  t,
}: ReimbursementRowProps) {
  const tActions = useTranslations('Balances.Actions')
  const [requestConfirmOpen, setRequestConfirmOpen] = useState(false)

  const { mutate: requestPayment, isPending: isRequesting } =
    trpc.groups.balances.requestPayment.useMutation({
      onSuccess: () => {
        toast.success(tActions('requestSent'))
        setRequestConfirmOpen(false)
      },
      onError: () => {
        toast.error(tActions('requestFailed'))
      },
    })

  const isDebtor = currentUserId === reimbursement.from
  const isCreditor = currentUserId === reimbursement.to
  const debtorName = getParticipant(reimbursement.from)?.name ?? 'Unknown'
  const formattedAmount = formatCurrency(currency, reimbursement.amount, locale)

  const handleRequestConfirm = () => {
    requestPayment({
      groupId,
      fromUserId: reimbursement.from,
      toUserId: reimbursement.to,
      amount: reimbursement.amount,
    })
  }

  const openSettlementExpense = () => {
    window.dispatchEvent(
      new CustomEvent('create-group-expense', {
        detail: {
          groupId,
          groupName,
          prefill: buildPaymentCreatePrefill(
            reimbursement.amount,
            reimbursement.from,
            reimbursement.to,
            currency,
          ),
        },
      }),
    )
  }

  return (
    <div
      className="py-4 flex justify-between items-center gap-4"
      key={reimbursement.from + reimbursement.to}
    >
      <div className="min-w-0">
        {t.rich('owes', {
          from: debtorName,
          to: getParticipant(reimbursement.to)?.name ?? 'Unknown',
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="tabular-nums">{formattedAmount}</span>
        {isDebtor && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={openSettlementExpense}
                  aria-label={tActions('settle')}
                />
              }
            >
              <Banknote className="size-4" />
            </TooltipTrigger>
            <TooltipContent>{tActions('settle')}</TooltipContent>
          </Tooltip>
        )}
        {isCreditor && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={openSettlementExpense}
                    aria-label={tActions('settleReceivedTooltip')}
                  />
                }
              >
                <Banknote className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                {tActions('settleReceivedTooltip')}
              </TooltipContent>
            </Tooltip>
            <AlertDialog
              open={requestConfirmOpen}
              onOpenChange={setRequestConfirmOpen}
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => setRequestConfirmOpen(true)}
                      disabled={isRequesting}
                      aria-label={t('requestTooltip')}
                    />
                  }
                >
                  {isRequesting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{t('requestTooltip')}</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('requestConfirmTitle')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('requestConfirmDescription', {
                      name: debtorName,
                      amount: formattedAmount,
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tActions('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRequestConfirm}
                    disabled={isRequesting}
                  >
                    {isRequesting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {tActions('sending')}
                      </>
                    ) : (
                      tActions('sendRequest')
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  )
}
