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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrency } from '@/lib/currency'
import { formatCurrency, formatDate } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ArrowRight, Banknote, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useSpinDelay } from 'spin-delay'

export default function PaymentDetailPage() {
  const params = useParams<{ username: string; expenseId: string }>()
  const { username, expenseId } = params

  return <PaymentDetailContent username={username} expenseId={expenseId} />
}

function PaymentDetailContent({
  username,
  expenseId,
}: {
  username: string
  expenseId: string
}) {
  const t = useTranslations('Friends.PaymentDetail')
  const locale = useLocale()
  const router = useRouter()
  const utils = trpc.useUtils()

  // Load the payment detail directly using the dedicated endpoint
  const {
    data: payment,
    isLoading: paymentLoading,
    isError,
  } = trpc.friends.getPaymentDetail.useQuery({
    expenseId,
    friendUsername: username,
  })

  const isLoading = useSpinDelay(paymentLoading, {
    delay: 200,
    minDuration: 300,
  })

  // Delete mutation
  const { mutate: deletePayment, isPending: isDeleting } =
    trpc.friends.deletePayment.useMutation({
      onSuccess: () => {
        utils.friends.getTimeline.invalidate()
        utils.friends.getDirectExpenses.invalidate()
        utils.friends.getBalanceDetail.invalidate()
        utils.friends.listWithBalances.invalidate()
        router.push(`/friends/${username}`)
      },
    })

  if (isLoading) {
    return <PaymentDetailSkeleton />
  }

  if (isError || !payment) {
    notFound()
  }

  const currency = getCurrency(payment.currency)
  const formattedAmount = formatCurrency(currency, payment.amount, locale)
  const formattedDate = formatDate(new Date(payment.expenseDate), locale, {
    dateStyle: 'long',
  })

  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      {/* Back link */}
      <Link
        href={`/friends/${username}`}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← {t('backToFriend', { name: payment.friendName })}
      </Link>

      {/* Payment visual: Payer → Payee */}
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex items-center justify-center size-12 rounded-full bg-muted">
          <Banknote className="size-6 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-3">
          {/* Payer */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary font-medium text-sm">
              {getInitials(payment.payer.name)}
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {payment.payer.name}
            </span>
          </div>

          {/* Arrow */}
          <ArrowRight className="size-5 text-muted-foreground" />

          {/* Payee */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary font-medium text-sm">
              {getInitials(payment.payee.name)}
            </div>
            <span className="text-xs text-muted-foreground font-medium">
              {payment.payee.name}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm font-medium text-center">
          {t('paid', { payer: payment.payer.name, payee: payment.payee.name })}
        </p>

        {/* Amount */}
        <p className="text-2xl font-bold">{formattedAmount}</p>

        {/* Date */}
        <p className="text-sm text-muted-foreground">{formattedDate}</p>
      </div>

      {/* Metadata: Added by */}
      <div className="text-xs text-muted-foreground text-center">
        {t('addedBy', {
          name: payment.addedBy.name,
          date: formatDate(new Date(payment.createdAt), locale, {
            dateStyle: 'medium',
          }),
        })}
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground text-center">
        {t('disclaimer')}
      </div>

      {/* Consolidation disclaimer */}
      {payment.creationMethod === 'DEBT_CONSOLIDATION' && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground text-center">
          {t('consolidationDisclaimer')}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center pt-2">
        <Link
          href={`/friends/${username}/payments/${expenseId}/edit`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Pencil className="size-4 mr-1.5" />
          {t('edit')}
        </Link>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm">
                <Trash2 className="size-4 mr-1.5" />
                {t('delete')}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('backToFriend', { name: '' }).trim()}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={() => deletePayment({ expenseId })}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  t('delete')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function PaymentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6">
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col items-center gap-4 py-6">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-5 w-5" />
          <Skeleton className="size-10 rounded-full" />
        </div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-4 w-64 mx-auto" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}
