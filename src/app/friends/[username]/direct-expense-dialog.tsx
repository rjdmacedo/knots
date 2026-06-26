'use client'

import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
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
import { Textarea } from '@/components/ui/textarea'
import { Locale } from '@/i18n'
import { handleAltEnterKeyDown } from '@/lib/alt-enter-submit'
import { getCurrency } from '@/lib/currency'
import { amountAsMinorUnits } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  friendId: string
  friendName: string
  friendUserId: string
  currentUserId: string
}

export function DirectExpenseDialog({
  open,
  onOpenChange,
  friendId,
  friendName,
  friendUserId,
  currentUserId,
}: Props) {
  const t = useTranslations('Friends.DirectExpense')
  const locale = useLocale() as Locale
  const utils = trpc.useUtils()

  // Get user's preferred currency
  const { data: profile } = trpc.profile.getProfile.useQuery()
  const currencyCode = profile?.preferredCurrency || 'EUR'
  const currency = getCurrency(currencyCode, locale)

  // Form state
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [paidByMe, setPaidByMe] = useState(true)
  const [expenseDate, setExpenseDate] = useState<Date>(new Date())
  const [notes, setNotes] = useState('')
  const [documents, setDocuments] = useState<
    { id: string; url: string; width: number; height: number }[]
  >([])

  // Pending upload/delete refs
  const uploadPendingRef = useRef<(() => Promise<void>) | null>(null)
  const deletePendingRef = useRef<(() => Promise<void>) | null>(null)

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle('')
      setAmount('')
      setPaidByMe(true)
      setExpenseDate(new Date())
      setNotes('')
      setDocuments([])
    }
  }, [open])

  const { mutate: createDirectExpense, isPending } =
    trpc.friends.createDirectExpense.useMutation({
      onSuccess: () => {
        utils.friends.getTimeline.invalidate({ friendId })
        utils.friends.getBalanceDetail.invalidate({ friendId })
        utils.friends.listWithBalances.invalidate()
        toast.success(t('success'))
        onOpenChange(false)
      },
      onError: () => {
        toast.error(t('error'))
      },
    })

  const parsedAmount = parseAmountValue(amount, currency.decimal_digits)
  const canSubmit =
    title.trim().length > 0 && parsedAmount !== null && !isPending

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || parsedAmount === null) return

    // Upload any pending documents first
    if (uploadPendingRef.current) {
      try {
        await uploadPendingRef.current()
      } catch {
        // Upload errors are handled by ExpenseDocumentsInput via toast
        return
      }
    }

    createDirectExpense({
      friendId,
      title: title.trim(),
      amount: amountAsMinorUnits(parsedAmount, currency),
      currency: currency.code,
      paidById: paidByMe ? currentUserId : friendUserId,
      expenseDate,
      notes: notes.trim() || undefined,
    })
  }, [
    canSubmit,
    parsedAmount,
    friendId,
    title,
    currency,
    paidByMe,
    currentUserId,
    friendUserId,
    expenseDate,
    notes,
    createDirectExpense,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) =>
          handleAltEnterKeyDown(event, handleSubmit, !canSubmit)
        }
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: friendName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Description / Title */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="direct-expense-title">
              {t('descriptionLabel')}
            </Label>
            <Input
              id="direct-expense-title"
              type="text"
              className="text-base"
              placeholder={t('descriptionPlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="direct-expense-amount">{t('amountLabel')}</Label>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">
                {currency.code}
              </span>
              <Input
                id="direct-expense-amount"
                type="text"
                inputMode="decimal"
                className="max-w-[160px]"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value
                    .replace(/[.,]/, '#')
                    .replace(/[.,]/g, '')
                    .replace(/#/, '.')
                    .replace(/[^-\d.]/g, '')
                  setAmount(value)
                }}
              />
            </div>
          </div>

          {/* Paid by toggle */}
          <div className="flex flex-col gap-2">
            <Label>{t('paidByLabel')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={paidByMe ? 'default' : 'outline'}
                onClick={() => setPaidByMe(true)}
              >
                {t('paidByYou')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!paidByMe ? 'default' : 'outline'}
                onClick={() => setPaidByMe(false)}
              >
                {friendName}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('splitEqually', {
                payer: paidByMe ? t('paidByYou') : friendName,
              })}
            </p>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="direct-expense-date">{t('dateLabel')}</Label>
            <Input
              id="direct-expense-date"
              className="date-base"
              type="date"
              value={formatDateForInput(expenseDate)}
              onChange={(e) => {
                const value = e.target.value
                if (value) {
                  const date = new Date(value)
                  if (!isNaN(date.getTime())) {
                    setExpenseDate(date)
                  }
                }
              }}
            />
          </div>

          {/* Attach image/PDF */}
          <div className="flex flex-col gap-2">
            <Label>{t('attachLabel')}</Label>
            <ExpenseDocumentsInput
              documents={documents}
              updateDocuments={setDocuments}
              onUploadPending={(fn) => {
                uploadPendingRef.current = fn
              }}
              onDeletePending={(fn) => {
                deletePendingRef.current = fn
              }}
            />
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="direct-expense-notes">{t('notesLabel')}</Label>
            <Textarea
              id="direct-expense-notes"
              className="text-base"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2">
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForInput(date: Date): string {
  if (!date || isNaN(date as any)) date = new Date()
  return date.toISOString().substring(0, 10)
}

function parseAmountValue(value: string, decimalDigits: number): number | null {
  const normalized = value.replace(/[^-\d.]/g, '')
  const num = Number(normalized)
  if (isNaN(num) || num <= 0) return null
  return num
}
