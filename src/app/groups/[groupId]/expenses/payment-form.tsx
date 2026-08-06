'use client'

import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'
import { CurrencyAmountInput } from '@/components/currency-amount-input'
import { DeletePopup } from '@/components/delete-popup'
import { DuplicateExpenseDialog } from '@/components/duplicate-expense-dialog'
import { useDuplicateCheck } from '@/components/hooks/use-duplicate-check'
import { useFormPersistence } from '@/components/hooks/use-form-persistence'
import { PreventNavigation } from '@/components/prevent-navigation'
import { SubmitButton } from '@/components/submit-button'
import { Button, buttonVariants } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Locale } from '@/i18n'
import { PAYMENT_CATEGORY_ID } from '@/lib/categories'
import { getCurrencyDisplaySymbol } from '@/lib/currency-input'
import type { DuplicateCheckResult } from '@/lib/duplicate-expense-detection'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'
import {
  ExpenseFormValues,
  PaymentFormValues,
  paymentFormSchema,
} from '@/lib/schemas'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  cn,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { zodResolver } from '@hookform/resolvers/zod'
import { RecurrenceRule } from '@prisma/client'
import { Save } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

type Props = {
  group: Group
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  createPrefill?: ExpenseFormCreatePrefill
  currentUserId?: string
  onSubmit: (value: ExpenseFormValues) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
  scrollHeader?: ReactNode
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime())
}

function formatDate(date?: Date) {
  if (!date || Number.isNaN(date as any)) date = new Date()
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDefaultPaidBy(
  group: Group,
  currentUserId?: string,
): string | undefined {
  if (
    currentUserId &&
    group.participants.some(({ id }) => id === currentUserId)
  ) {
    return currentUserId
  }

  return undefined
}

function getDefaultPaidTo(
  expense: Props['expense'],
  createPrefill: Props['createPrefill'],
  paidBy: string | undefined,
  participants: Group['participants'],
): string | undefined {
  if (expense) {
    const recipient = expense.paidFor.find(
      (entry) => entry.userId !== expense.paidById,
    )
    return recipient?.userId ?? expense.paidFor[0]?.userId
  }

  if (createPrefill?.paidFor?.[0]?.participant) {
    return createPrefill.paidFor[0].participant
  }

  return participants.find((participant) => participant.id !== paidBy)?.id
}

export function PaymentForm({
  group,
  expense,
  createPrefill,
  currentUserId,
  onSubmit,
  onDelete,
  onCancel,
  scrollHeader,
}: Props) {
  const t = useTranslations('PaymentForm')
  const tExpense = useTranslations('ExpenseForm')
  const tDuplicate = useTranslations('DuplicateExpense')
  const locale = useLocale() as Locale
  const router = useRouter()
  const isCreate = expense === undefined
  const groupCurrency = getCurrencyFromGroup(group)
  const defaultPaidBy =
    expense?.paidById ??
    createPrefill?.paidBy ??
    getDefaultPaidBy(group, currentUserId)

  const { checkForDuplicates, isChecking } = useDuplicateCheck({
    context: { type: 'group', groupId: group.id },
  })
  const [duplicateMatches, setDuplicateMatches] = useState<
    DuplicateCheckResult['matches']
  >([])
  const [pendingSubmitData, setPendingSubmitData] =
    useState<ExpenseFormValues | null>(null)
  const { save, restore, clear } = useFormPersistence<PaymentFormValues>({
    key: `knots:duplicate-form:payment-${group.id}:${expense?.id || 'new'}`,
  })

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: expense
      ? {
          expenseDate: expense.expenseDate ?? new Date(),
          amount: amountAsDecimal(expense.amount, groupCurrency),
          paidBy: expense.paidById,
          paidTo:
            getDefaultPaidTo(
              expense,
              createPrefill,
              expense.paidById,
              group.participants,
            ) ?? '',
          notes: expense.notes ?? '',
        }
      : createPrefill
        ? {
            expenseDate: createPrefill.expenseDate ?? new Date(),
            amount: createPrefill.amount ?? 0,
            paidBy: defaultPaidBy ?? '',
            paidTo:
              getDefaultPaidTo(
                undefined,
                createPrefill,
                defaultPaidBy,
                group.participants,
              ) ?? '',
            notes: createPrefill.notes ?? '',
          }
        : {
            expenseDate: new Date(),
            amount: 0,
            paidBy: defaultPaidBy ?? '',
            paidTo:
              getDefaultPaidTo(
                undefined,
                undefined,
                defaultPaidBy,
                group.participants,
              ) ?? '',
            notes: '',
          },
  })

  const submit = async (values: PaymentFormValues) => {
    const amountMinor = amountAsMinorUnits(values.amount, groupCurrency)
    const expenseValues: ExpenseFormValues = {
      expenseDate: values.expenseDate,
      title: '',
      category: PAYMENT_CATEGORY_ID,
      amount: amountMinor,
      paidBy: values.paidBy,
      paidFor: [{ participant: values.paidTo, shares: amountMinor }],
      splitMode: 'BY_AMOUNT',
      saveDefaultSplittingOptions: false,
      isReimbursement: true,
      documents: expense?.documents ?? [],
      notes: values.notes ?? '',
      recurrenceRule: RecurrenceRule.NONE,
    }

    // Check for duplicates before submitting
    const result = await checkForDuplicates({
      title: expenseValues.title,
      amount: amountMinor,
      expenseDate: values.expenseDate,
      categoryId: PAYMENT_CATEGORY_ID,
      excludeExpenseId: expense?.id,
    })

    if (result.hasDuplicates) {
      setDuplicateMatches(result.matches)
      setPendingSubmitData(expenseValues)
      return
    }

    await onSubmit(expenseValues)
  }

  useEffect(() => {
    const restored = restore()
    if (!restored) return
    form.reset({
      ...restored,
      expenseDate: new Date(restored.expenseDate),
    })
    clear()
  }, [restore, clear, form])

  const handleDuplicateConfirm = async () => {
    if (pendingSubmitData) {
      setDuplicateMatches([])
      const data = pendingSubmitData
      setPendingSubmitData(null)
      await onSubmit(data)
    }
  }

  const handleDuplicateCancel = () => {
    setDuplicateMatches([])
    setPendingSubmitData(null)
  }

  const handleMatchClick = useCallback(
    (matchId: string) => {
      const success = save(form.getValues())
      if (!success) {
        toast.error(tDuplicate('persistError'))
        return
      }

      setDuplicateMatches([])
      setPendingSubmitData(null)
      // Clear dirty state so PreventNavigation does not block navigation
      form.reset(form.getValues())
      router.push(getGroupExpenseDetailPath(group.id, matchId))
    },
    [save, form, tDuplicate, router, group.id],
  )

  const formFooter = (
    <DialogFooter className="flex shrink-0 flex-col-reverse gap-2 border-t bg-popover px-0 pt-4 pb-0 sm:flex-row sm:justify-end">
      <SubmitButton
        form="payment-form"
        loadingContent={tExpense(isCreate ? 'creating' : 'saving')}
        isLoading={isChecking}
      >
        <Save className="w-4 h-4 mr-2" />
        {tExpense(isCreate ? 'create' : 'save')}
      </SubmitButton>
      {!isCreate && onDelete ? <DeletePopup onDelete={onDelete} /> : null}
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tExpense('cancel')}
        </Button>
      ) : (
        <Link
          href={`/groups/${group.id}`}
          className={buttonVariants({ variant: 'ghost' })}
        >
          {tExpense('cancel')}
        </Link>
      )}
    </DialogFooter>
  )

  return (
    <Form {...form}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col @container">
        <form
          id="payment-form"
          onSubmit={form.handleSubmit(submit)}
          className={cn(
            'min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-contain scrollbar-none',
            '[&_[data-slot=button]:focus-visible]:ring-inset [&_[data-slot=checkbox]:focus-visible]:ring-inset [&_[data-slot=input]:focus-visible]:ring-inset [&_[data-slot=input-group]:has([data-slot=input-group-control]:focus-visible)]:ring-inset',
          )}
        >
          <div className="min-w-0 py-2">
            {scrollHeader}
            <div className={cn('space-y-4', scrollHeader && 'border-t pt-4')}>
              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dateLabel')}</FormLabel>
                    <FormControl>
                      <Input
                        className="date-base"
                        type="date"
                        value={formatDate(field.value)}
                        onChange={(event) => {
                          const value = event.target.value
                          if (!value) {
                            field.onChange(null)
                          } else if (isValidDateString(value)) {
                            const [year, month, day] = value
                              .split('-')
                              .map(Number)
                            field.onChange(
                              new Date(
                                Date.UTC(year, month - 1, day, 12, 0, 0),
                              ),
                            )
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>{t('dateDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field: { onChange, onBlur, ref, name, value } }) => (
                  <FormItem>
                    <FormLabel>{t('amountLabel')}</FormLabel>
                    <FormControl>
                      <InputGroup>
                        <InputGroupAddon align="inline-start">
                          <InputGroupText className="tabular-nums">
                            {getCurrencyDisplaySymbol(groupCurrency)}
                          </InputGroupText>
                        </InputGroupAddon>
                        <CurrencyAmountInput
                          ref={ref}
                          name={name}
                          onBlur={onBlur}
                          currency={groupCurrency}
                          locale={locale}
                          value={value}
                          onValueChange={onChange}
                        />
                      </InputGroup>
                    </FormControl>
                    <FormDescription>{t('amountDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paidBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('paidByLabel')}</FormLabel>
                    <Select
                      items={group.participants.map(({ id, name }) => ({
                        value: id,
                        label: name,
                      }))}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t('participantPlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {group.participants.map(({ id, name }) => (
                          <SelectItem key={id} value={id}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('paidByDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paidTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('paidToLabel')}</FormLabel>
                    <Select
                      items={group.participants.map(({ id, name }) => ({
                        value: id,
                        label: name,
                      }))}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t('participantPlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {group.participants.map(({ id, name }) => (
                          <SelectItem key={id} value={id}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t('paidToDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('notesLabel')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        className="text-base"
                        placeholder={t('notesPlaceholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                {t('disclaimer')}
              </p>
            </div>
          </div>
        </form>
        {formFooter}
      </div>

      <DuplicateExpenseDialog
        open={duplicateMatches.length > 0}
        matches={duplicateMatches}
        newExpense={{
          title: '',
          amount: amountAsMinorUnits(form.getValues('amount'), groupCurrency),
          expenseDate: form.getValues('expenseDate') ?? new Date(),
        }}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
        onMatchClick={handleMatchClick}
        currency={groupCurrency}
        locale={locale}
      />

      <PreventNavigation
        isDirty={form.formState.isDirty}
        resetData={form.reset}
        title="Unsaved Changes"
        description="You have unsaved changes. If you leave, your data will be lost."
        cancelLabel="Stay"
        confirmLabel="Leave"
      />
    </Form>
  )
}
