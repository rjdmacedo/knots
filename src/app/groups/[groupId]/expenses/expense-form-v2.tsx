'use client'

import { CategorySelector } from '@/components/category-selector'
import { CurrencySelector } from '@/components/currency-selector'
import { DeletePopup } from '@/components/delete-popup'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { extractCategoryFromTitle } from '@/components/expense-form-actions'
import { SubmitButton } from '@/components/submit-button'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Locale } from '@/i18n'
import { randomId } from '@/lib/api'
import { defaultCurrencyList, getCurrency } from '@/lib/currency'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useActiveUser, useCurrencyRate } from '@/lib/hooks'
import {
  ExpenseFormValues,
  SplittingOptions,
  expenseFormSchema,
} from '@/lib/schemas'
import { calculateShare } from '@/lib/totals'
import {
  amountAsDecimal,
  amountAsMinorUnits,
  cn,
  formatCurrency,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { zodResolver } from '@hookform/resolvers/zod'
import { RecurrenceRule } from '@prisma/client'
import { ChevronRight, Save } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { match } from 'ts-pattern'

// ─── Utilities ───────────────────────────────────────────────────────────────

const enforceCurrencyPattern = (value: string) =>
  value
    .replace(/^\s*-/, '_')
    .replace(/[.,]/, '#')
    .replace(/[-.,]/g, '')
    .replace(/_/, '-')
    .replace(/#/, '.')
    .replace(/[^-\d.]/g, '')

const isValidDateString = (value: string): boolean => {
  const date = new Date(value)
  return !isNaN(date.getTime())
}

function formatDate(date?: Date) {
  if (!date || isNaN(date as any)) date = new Date()
  return date.toISOString().substring(0, 10)
}

// ─── Default splitting options ───────────────────────────────────────────────

const getDefaultSplittingOptions = (
  group: NonNullable<AppRouterOutput['groups']['get']['group']>,
) => {
  const defaultValue = {
    splitMode: 'EVENLY' as const,
    paidFor: group.participants.map(({ id }) => ({
      participant: id,
      shares: 1,
    })),
  }

  if (typeof localStorage === 'undefined') return defaultValue
  const defaultSplitMode = localStorage.getItem(
    `${group.id}-defaultSplittingOptions`,
  )
  if (defaultSplitMode === null) return defaultValue
  const parsedDefaultSplitMode = JSON.parse(
    defaultSplitMode,
  ) as SplittingOptions

  if (parsedDefaultSplitMode.paidFor === null) {
    parsedDefaultSplitMode.paidFor = defaultValue.paidFor
  }

  for (const parsedPaidFor of parsedDefaultSplitMode.paidFor) {
    if (
      !group.participants.some(({ id }) => id === parsedPaidFor.participant)
    ) {
      localStorage.removeItem(`${group.id}-defaultSplittingOptions`)
      return defaultValue
    }
  }

  return {
    splitMode: parsedDefaultSplitMode.splitMode,
    paidFor: parsedDefaultSplitMode.paidFor.map((paidFor) => ({
      participant: paidFor.participant,
      shares: paidFor.shares / 100,
    })),
  }
}

async function persistDefaultSplittingOptions(
  groupId: string,
  expenseFormValues: ExpenseFormValues,
) {
  if (localStorage && expenseFormValues.saveDefaultSplittingOptions) {
    const computePaidFor = (): SplittingOptions['paidFor'] => {
      if (expenseFormValues.splitMode === 'EVENLY') {
        return expenseFormValues.paidFor.map(({ participant }) => ({
          participant,
          shares: 100,
        }))
      } else if (expenseFormValues.splitMode === 'BY_AMOUNT') {
        return null
      } else {
        return expenseFormValues.paidFor
      }
    }

    const splittingOptions = {
      splitMode: expenseFormValues.splitMode,
      paidFor: computePaidFor(),
    } satisfies SplittingOptions

    localStorage.setItem(
      `${groupId}-defaultSplittingOptions`,
      JSON.stringify(splittingOptions),
    )
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ExpenseFormV2({
  group,
  categories,
  expense,
  currentUserId,
  onSubmit,
  onDelete,
  runtimeFeatureFlags,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  categories: AppRouterOutput['categories']['list']['categories']
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  currentUserId?: string
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
  const searchParams = useSearchParams()

  const getDefaultPaidBy = (): string | undefined => {
    if (!isCreate) return undefined

    if (
      currentUserId &&
      group.participants.some(({ id }) => id === currentUserId)
    ) {
      return currentUserId
    }

    if (typeof window !== 'undefined') {
      const activeUser = localStorage.getItem(`${group.id}-activeUser`)
      if (activeUser && activeUser !== 'None') {
        return activeUser
      }
    }

    return undefined
  }

  const getSelectedRecurrenceRule = (field?: { value: string }) => {
    return field?.value as RecurrenceRule
  }

  const defaultSplittingOptions = getDefaultSplittingOptions(group)
  const groupCurrency = getCurrencyFromGroup(group)

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: expense
      ? {
          title: expense.title,
          expenseDate: expense.expenseDate ?? new Date(),
          amount: amountAsDecimal(expense.amount, groupCurrency),
          originalCurrency: expense.originalCurrency ?? group.currencyCode,
          originalAmount: expense.originalAmount ?? undefined,
          conversionRate: expense.conversionRate?.toNumber(),
          category: expense.categoryId,
          paidBy: expense.paidById,
          paidFor: expense.paidFor.map(({ userId, shares }) => {
            const shareValue =
              expense.splitMode === 'BY_AMOUNT'
                ? amountAsDecimal(shares, groupCurrency)
                : shares / 100
            return {
              participant: userId,
              shares: shareValue <= 0 ? 1 : shareValue,
            }
          }),
          splitMode: expense.splitMode,
          saveDefaultSplittingOptions: false,
          isReimbursement: expense.isReimbursement,
          documents: expense.documents,
          notes: expense.notes ?? '',
          recurrenceRule: expense.recurrenceRule ?? undefined,
        }
      : searchParams.get('reimbursement')
        ? {
            title: t('reimbursement'),
            expenseDate: new Date(),
            amount: amountAsDecimal(
              Number(searchParams.get('amount')) || 0,
              groupCurrency,
            ),
            originalCurrency: group.currencyCode,
            originalAmount: undefined,
            conversionRate: undefined,
            category: 1,
            paidBy: searchParams.get('from') ?? undefined,
            paidFor: [
              searchParams.get('to')
                ? {
                    participant: searchParams.get('to')!,
                    shares: 1,
                  }
                : undefined,
            ],
            isReimbursement: true,
            splitMode: defaultSplittingOptions.splitMode,
            saveDefaultSplittingOptions: false,
            documents: [],
            notes: '',
            recurrenceRule: RecurrenceRule.NONE,
          }
        : {
            title: searchParams.get('title') ?? '',
            expenseDate: searchParams.get('date')
              ? new Date(searchParams.get('date') as string)
              : new Date(),
            amount: Number(searchParams.get('amount')) || 0,
            originalCurrency: group.currencyCode ?? undefined,
            originalAmount: undefined,
            conversionRate: undefined,
            category: searchParams.get('categoryId')
              ? Number(searchParams.get('categoryId'))
              : 0,
            paidFor: defaultSplittingOptions.paidFor,
            paidBy: getDefaultPaidBy(),
            isReimbursement: false,
            splitMode: defaultSplittingOptions.splitMode,
            saveDefaultSplittingOptions: false,
            documents: searchParams.get('imageUrl')
              ? [
                  {
                    id: randomId(),
                    url: searchParams.get('imageUrl') as string,
                    width: Number(searchParams.get('imageWidth')),
                    height: Number(searchParams.get('imageHeight')),
                  },
                ]
              : [],
            notes: '',
            recurrenceRule: RecurrenceRule.NONE,
          },
  })

  const [isCategoryLoading, setCategoryLoading] = useState(false)
  const activeUserId = useActiveUser(group.id)
  const utils = trpc.useUtils()
  const uploadPendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)
  const deletePendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)

  const [isIncome, setIsIncome] = useState(Number(form.getValues().amount) < 0)
  const [manuallyEditedParticipants, setManuallyEditedParticipants] = useState<
    Set<string>
  >(new Set())

  const sExpense = isIncome ? 'Income' : 'Expense'

  const originalCurrency = getCurrency(
    form.getValues('originalCurrency'),
    locale,
    'Custom',
  )
  const exchangeRate = useCurrencyRate(
    form.watch('expenseDate'),
    form.watch('originalCurrency') ?? '',
    groupCurrency.code,
  )

  const conversionRequired =
    group.currencyCode &&
    group.currencyCode.length &&
    originalCurrency.code.length &&
    originalCurrency.code !== group.currencyCode

  const submit = async (values: ExpenseFormValues) => {
    if (uploadPendingDocumentsRef.current) {
      try {
        await uploadPendingDocumentsRef.current()
        values.documents = form.getValues('documents')
      } catch (err) {
        throw err
      }
    }

    await persistDefaultSplittingOptions(group.id, values)

    values.amount = amountAsMinorUnits(values.amount, groupCurrency)
    values.paidFor = values.paidFor.map(({ participant, shares }) => ({
      participant,
      shares:
        values.splitMode === 'BY_AMOUNT'
          ? amountAsMinorUnits(shares, groupCurrency)
          : shares,
    }))

    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
    }

    await onSubmit(values, activeUserId ?? undefined)

    if (deletePendingDocumentsRef.current) {
      try {
        await deletePendingDocumentsRef.current()
      } catch (err) {
        console.error('Failed to delete documents from S3:', err)
      }
    }
  }

  const amount = form.watch('amount')
  const splitMode = form.watch('splitMode')

  useEffect(() => {
    setManuallyEditedParticipants(new Set())
  }, [splitMode, amount])

  useEffect(() => {
    const splitMode = form.getValues().splitMode

    if (
      splitMode === 'BY_AMOUNT' &&
      (form.getFieldState('paidFor').isDirty ||
        form.getFieldState('amount').isDirty)
    ) {
      const totalAmount = Number(form.getValues().amount) || 0
      const paidFor = form.getValues().paidFor
      let newPaidFor = [...paidFor]

      const editedParticipants = Array.from(manuallyEditedParticipants)
      let remainingAmount = totalAmount
      let remainingParticipants = newPaidFor.length - editedParticipants.length

      newPaidFor = newPaidFor.map((participant) => {
        if (editedParticipants.includes(participant.participant)) {
          const participantShare = Number(participant.shares) || 0
          if (splitMode === 'BY_AMOUNT') {
            remainingAmount -= participantShare
          }
          return participant
        }
        return participant
      })

      if (remainingParticipants > 0) {
        let amountPerRemaining = 0
        if (splitMode === 'BY_AMOUNT') {
          amountPerRemaining = remainingAmount / remainingParticipants
        }

        newPaidFor = newPaidFor.map((participant) => {
          if (!editedParticipants.includes(participant.participant)) {
            return {
              ...participant,
              shares: Number(
                amountPerRemaining.toFixed(groupCurrency.decimal_digits),
              ),
            }
          }
          return participant
        })
      }
      form.setValue('paidFor', newPaidFor, { shouldValidate: true })
    }
  }, [
    form,
    amount,
    splitMode,
    manuallyEditedParticipants,
    groupCurrency.decimal_digits,
  ])

  const [usingCustomConversionRate, setUsingCustomConversionRate] = useState(
    !!form.formState.defaultValues?.conversionRate,
  )

  useEffect(() => {
    if (!usingCustomConversionRate && exchangeRate.data) {
      form.setValue('conversionRate', exchangeRate.data)
    }
  }, [exchangeRate.data, usingCustomConversionRate, form])

  const originalAmount = form.watch('originalAmount')
  const conversionRate = form.watch('conversionRate')
  const originalAmountFieldState = form.getFieldState('originalAmount')

  useEffect(() => {
    if (!originalAmountFieldState.isTouched) return
    const originalAmountValue = form.getValues('originalAmount') ?? 0
    const conversionRateValue = form.getValues('conversionRate')

    if (conversionRateValue && originalAmountValue) {
      const rate = Number(conversionRateValue)
      const convertedAmount = originalAmountValue * rate
      if (!Number.isNaN(convertedAmount)) {
        const v = enforceCurrencyPattern(
          convertedAmount.toFixed(groupCurrency.decimal_digits),
        )
        const income = Number(v) < 0
        setIsIncome(income)
        if (income) form.setValue('isReimbursement', false)
        form.setValue('amount', Number(v))
      }
    }
  }, [
    form,
    originalAmount,
    conversionRate,
    groupCurrency.decimal_digits,
    originalAmountFieldState.isTouched,
  ])

  let conversionRateMessage = ''
  if (exchangeRate.isLoading) {
    conversionRateMessage = t('conversionRateState.loading')
  } else {
    let ratesDisplay = ''
    if (exchangeRate.data) {
      ratesDisplay = `${form.getValues('originalCurrency')}\xa01\xa0=\xa0${
        group.currencyCode
      }\xa0${exchangeRate.data}`
    }
    if (exchangeRate.error) {
      if (exchangeRate.error instanceof RangeError && exchangeRate.data)
        conversionRateMessage = t('conversionRateState.dateMismatch', {
          date: exchangeRate.error.message,
        })
      else {
        conversionRateMessage = t('conversionRateState.error')
      }
      conversionRateMessage +=
        ' ' +
        (ratesDisplay.length
          ? `${t('conversionRateState.staleRate')} ${ratesDisplay}`
          : t('conversionRateState.noRate'))
    } else {
      conversionRateMessage = ratesDisplay.length
        ? `${t('conversionRateState.success')} ${ratesDisplay}`
        : t('conversionRateState.currencyNotFound')
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <Form {...form}>
        {/* 
          The native <form> wraps ONLY the expense details card (Card 1).
          This keeps the native form element short (~500px, like GroupForm/Settings)
          and avoids the iOS Safari viewport bug when keyboard closes on tall forms.
          
          Cards 2+ and the submit button are outside <form> but inside <Form> (FormProvider).
          The submit button uses the HTML form="" attribute to associate with this form.
        */}
        <form id="expense-form-v2" onSubmit={form.handleSubmit(submit)}>
          <ExpenseDetailsCard
            form={form}
            group={group}
            categories={categories}
            locale={locale}
            isIncome={isIncome}
            setIsIncome={setIsIncome}
            sExpense={sExpense}
            isCreate={isCreate}
            groupCurrency={groupCurrency}
            originalCurrency={originalCurrency}
            conversionRequired={!!conversionRequired}
            conversionRateMessage={conversionRateMessage}
            exchangeRate={exchangeRate}
            usingCustomConversionRate={usingCustomConversionRate}
            setUsingCustomConversionRate={setUsingCustomConversionRate}
            isCategoryLoading={isCategoryLoading}
            setCategoryLoading={setCategoryLoading}
            runtimeFeatureFlags={runtimeFeatureFlags}
            utils={utils}
            getDefaultPaidBy={getDefaultPaidBy}
            getSelectedRecurrenceRule={getSelectedRecurrenceRule}
            t={t}
          />
        </form>

        {/* Card 2: Paid For — outside native <form> */}
        <PaidForCard
          form={form}
          group={group}
          expense={expense}
          groupCurrency={groupCurrency}
          originalCurrency={originalCurrency}
          conversionRequired={!!conversionRequired}
          exchangeRate={exchangeRate}
          sExpense={sExpense}
          locale={locale}
          manuallyEditedParticipants={manuallyEditedParticipants}
          setManuallyEditedParticipants={setManuallyEditedParticipants}
          t={t}
        />

        {/* Card 3: Documents — outside native <form> */}
        {runtimeFeatureFlags.enableExpenseDocuments && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex justify-between">
                <span>{t('attachDocuments')}</span>
              </CardTitle>
              <CardDescription>
                {t(`${sExpense}.attachDescription`)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="documents"
                render={({ field }) => (
                  <ExpenseDocumentsInput
                    documents={field.value}
                    updateDocuments={field.onChange}
                    onUploadPending={(uploadFn) => {
                      uploadPendingDocumentsRef.current = uploadFn
                    }}
                    onDeletePending={(deleteFn) => {
                      deletePendingDocumentsRef.current = deleteFn
                    }}
                  />
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Action buttons — submit uses form="" to target the native form */}
        <div className="flex mt-4 gap-2">
          <SubmitButton
            form="expense-form-v2"
            loadingContent={t(isCreate ? 'creating' : 'saving')}
          >
            <Save className="w-4 h-4 mr-2" />
            {t(isCreate ? 'create' : 'save')}
          </SubmitButton>
          {!isCreate && onDelete && (
            <DeletePopup onDelete={() => onDelete(activeUserId ?? undefined)} />
          )}
          <Button variant="ghost" asChild>
            <Link href={`/groups/${group.id}`}>{t('cancel')}</Link>
          </Button>
        </div>
      </Form>
    </div>
  )
}

// ─── Expense Details Card (Card 1) ──────────────────────────────────────────

function ExpenseDetailsCard({
  form,
  group,
  categories,
  locale,
  isIncome,
  setIsIncome,
  sExpense,
  isCreate,
  groupCurrency,
  originalCurrency,
  conversionRequired,
  conversionRateMessage,
  exchangeRate,
  usingCustomConversionRate,
  setUsingCustomConversionRate,
  isCategoryLoading,
  setCategoryLoading,
  runtimeFeatureFlags,
  utils,
  getDefaultPaidBy,
  getSelectedRecurrenceRule,
  t,
}: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(`${sExpense}.${isCreate ? 'create' : 'edit'}`)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-6">
        {/* Title */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>{t(`${sExpense}.TitleField.label`)}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t(`${sExpense}.TitleField.placeholder`)}
                  className="text-base"
                  {...field}
                  onBlur={async () => {
                    field.onBlur()
                    try {
                      if (field.value.trim().length > 0) {
                        const { categoryId: mappedCategoryId } =
                          await utils.groups.expenses.lookupCategory.fetch({
                            groupId: group.id,
                            title: field.value,
                          })
                        if (mappedCategoryId !== null) {
                          form.setValue('category', mappedCategoryId)
                          return
                        }
                      }
                    } catch {
                      // Fall through
                    }
                    if (runtimeFeatureFlags.enableCategoryExtract) {
                      setCategoryLoading(true)
                      const { categoryId } = await extractCategoryFromTitle(
                        field.value,
                      )
                      form.setValue('category', categoryId)
                      setCategoryLoading(false)
                    }
                  }}
                />
              </FormControl>
              <FormDescription>
                {t(`${sExpense}.TitleField.description`)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date */}
        <FormField
          control={form.control}
          name="expenseDate"
          render={({ field }: any) => (
            <FormItem className="sm:order-1">
              <FormLabel>{t(`${sExpense}.DateField.label`)}</FormLabel>
              <FormControl>
                <Input
                  className="text-base"
                  type="date"
                  value={formatDate(field.value)}
                  onChange={(event) => {
                    const value = event.target.value
                    if (!value) {
                      field.onChange(null)
                    } else if (isValidDateString(value)) {
                      field.onChange(new Date(value))
                    }
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormDescription>
                {t(`${sExpense}.DateField.description`)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Currency */}
        <FormField
          name="originalCurrency"
          render={({ field: { onChange, ...field } }: any) => (
            <FormItem className="sm:order-3">
              <FormLabel>{t(`${sExpense}.currencyField.label`)}</FormLabel>
              <FormControl>
                {group.currencyCode ? (
                  <CurrencySelector
                    currencies={defaultCurrencyList(locale, '')}
                    defaultValue={form.watch(field.name) ?? ''}
                    isLoading={false}
                    onValueChange={(v: string) => onChange(v)}
                  />
                ) : (
                  <Input
                    className="text-base"
                    disabled={true}
                    {...field}
                    placeholder={group.currency}
                  />
                )}
              </FormControl>
              <FormDescription>
                {t(`${sExpense}.currencyField.description`)}{' '}
                {!group.currencyCode && t('conversionUnavailable')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Original amount + conversion rate */}
        <div
          className={`sm:order-4 ${
            !conversionRequired ? 'hidden sm:invisible' : ''
          } sm:col-span-2 md:col-span-1 space-y-2`}
        >
          <FormField
            control={form.control}
            name="originalAmount"
            render={({ field: { onChange, ...field } }: any) => (
              <FormItem>
                <FormLabel>{t('originalAmountField.label')}</FormLabel>
                <div className="flex items-baseline gap-2">
                  <span>{originalCurrency.symbol}</span>
                  <FormControl>
                    <Input
                      className="text-base max-w-[120px]"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      onChange={(event: any) => {
                        const v = enforceCurrencyPattern(event.target.value)
                        onChange(v)
                      }}
                      {...field}
                      onFocus={(e: any) => {
                        const target = e.currentTarget
                        setTimeout(() => target.select(), 1)
                      }}
                    />
                  </FormControl>
                </div>
                <FormDescription>
                  {(() => {
                    const expenseDate = form.getValues('expenseDate')
                    const hasValidDate =
                      expenseDate instanceof Date &&
                      !isNaN(expenseDate.getTime())

                    if (!hasValidDate) {
                      return t('conversionRateState.noDate')
                    }

                    if (!usingCustomConversionRate) {
                      return (
                        <>
                          {conversionRateMessage}
                          {!exchangeRate.isLoading && (
                            <Button
                              className="h-auto py-0"
                              variant="link"
                              type="button"
                              onClick={() => exchangeRate.refresh()}
                            >
                              {t('conversionRateState.refresh')}
                            </Button>
                          )}
                        </>
                      )
                    }

                    return t('conversionRateState.customRate')
                  })()}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Collapsible
            open={usingCustomConversionRate}
            onOpenChange={setUsingCustomConversionRate}
          >
            <CollapsibleTrigger asChild>
              <Button variant="link" type="button" className="-mx-4">
                {usingCustomConversionRate
                  ? t('conversionRateField.useApi')
                  : t('conversionRateField.useCustom')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <FormField
                control={form.control}
                name="conversionRate"
                render={({ field: { onChange, ...field } }: any) => (
                  <FormItem
                    className={`sm:order-4 ${
                      !conversionRequired ? 'hidden sm:invisible' : ''
                    }`}
                  >
                    <FormLabel>{t('conversionRateField.label')}</FormLabel>
                    <div className="flex items-baseline gap-2">
                      <span>
                        {originalCurrency.symbol} 1 = {group.currency}
                      </span>
                      <FormControl>
                        <Input
                          className="text-base max-w-[120px]"
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          onChange={(event: any) => {
                            const v = enforceCurrencyPattern(event.target.value)
                            onChange(v)
                          }}
                          {...field}
                          onFocus={(e: any) => {
                            const target = e.currentTarget
                            setTimeout(() => target.select(), 1)
                          }}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Category */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }: any) => (
            <FormItem className="order-3 sm:order-2">
              <FormLabel>{t('categoryField.label')}</FormLabel>
              <CategorySelector
                categories={categories}
                defaultValue={form.watch(field.name)}
                onValueChange={field.onChange}
                isLoading={isCategoryLoading}
              />
              <FormDescription>
                {t(`${sExpense}.categoryFieldDescription`)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field: { onChange, ...field } }: any) => (
            <FormItem className="sm:order-5">
              <FormLabel>{t('amountField.label')}</FormLabel>
              <div className="flex items-baseline gap-2">
                <span>{group.currency}</span>
                <FormControl>
                  <Input
                    className="text-base max-w-[120px]"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    onChange={(event: any) => {
                      const v = enforceCurrencyPattern(event.target.value)
                      const income = Number(v) < 0
                      setIsIncome(income)
                      if (income) form.setValue('isReimbursement', false)
                      onChange(v)
                    }}
                    onFocus={(e: any) => {
                      const target = e.currentTarget
                      setTimeout(() => target.select(), 1)
                    }}
                    {...field}
                  />
                </FormControl>
              </div>
              <FormMessage />

              {!isIncome && (
                <FormField
                  control={form.control}
                  name="isReimbursement"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-row gap-2 items-center space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div>
                        <FormLabel>{t('isReimbursementField.label')}</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              )}
            </FormItem>
          )}
        />

        {/* Paid By */}
        <FormField
          control={form.control}
          name="paidBy"
          render={({ field }: any) => (
            <FormItem className="sm:order-5">
              <FormLabel>{t(`${sExpense}.paidByField.label`)}</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value ?? getDefaultPaidBy()}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(`${sExpense}.paidByField.placeholder`)}
                  />
                </SelectTrigger>
                <SelectContent>
                  {group.participants.map(({ id, name }: any) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {t(`${sExpense}.paidByField.description`)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }: any) => (
            <FormItem className="sm:order-6">
              <FormLabel>{t('notesField.label')}</FormLabel>
              <FormControl>
                <Textarea className="text-base" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Recurrence */}
        <FormField
          control={form.control}
          name="recurrenceRule"
          render={({ field }: any) => (
            <FormItem className="sm:order-5">
              <FormLabel>{t(`${sExpense}.recurrenceRule.label`)}</FormLabel>
              <Select
                onValueChange={(value) => {
                  form.setValue('recurrenceRule', value as RecurrenceRule)
                }}
                defaultValue={getSelectedRecurrenceRule(field)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="NONE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">
                    {t(`${sExpense}.recurrenceRule.none`)}
                  </SelectItem>
                  <SelectItem value="DAILY">
                    {t(`${sExpense}.recurrenceRule.daily`)}
                  </SelectItem>
                  <SelectItem value="WEEKLY">
                    {t(`${sExpense}.recurrenceRule.weekly`)}
                  </SelectItem>
                  <SelectItem value="MONTHLY">
                    {t(`${sExpense}.recurrenceRule.monthly`)}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                {t(`${sExpense}.recurrenceRule.description`)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}

// ─── Paid For Card (Card 2) ──────────────────────────────────────────────────

function PaidForCard({
  form,
  group,
  expense,
  groupCurrency,
  originalCurrency,
  conversionRequired,
  exchangeRate,
  sExpense,
  locale,
  manuallyEditedParticipants,
  setManuallyEditedParticipants,
  t,
}: any) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex justify-between">
          <span>{t(`${sExpense}.paidFor.title`)}</span>
          <Button
            variant="link"
            type="button"
            className="-my-2 -mx-4"
            onClick={() => {
              const paidFor = form.getValues().paidFor
              const allSelected = paidFor.length === group.participants.length
              const newPaidFor = allSelected
                ? []
                : group.participants.map((p: any) => ({
                    participant: p.id,
                    shares:
                      paidFor.find((pfor: any) => pfor.participant === p.id)
                        ?.shares ?? 1,
                  }))
              form.setValue('paidFor', newPaidFor, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })
            }}
          >
            {form.getValues().paidFor.length === group.participants.length ? (
              <>{t('selectNone')}</>
            ) : (
              <>{t('selectAll')}</>
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          {t(`${sExpense}.paidFor.description`)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="paidFor"
          render={() => (
            <FormItem className="sm:order-4 row-span-2 space-y-0">
              {group.participants.map(({ id, name }: any) => (
                <FormField
                  key={id}
                  control={form.control}
                  name="paidFor"
                  render={({ field }: any) => {
                    return (
                      <div
                        data-id={`${id}/${form.getValues().splitMode}/${group.currency}`}
                        className="flex flex-wrap gap-y-4 items-center border-t last-of-type:border-b last-of-type:!mb-4 -mx-6 px-6 py-3"
                      >
                        <FormItem className="flex-1 flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.some(
                                ({ participant }: any) => participant === id,
                              )}
                              onCheckedChange={(checked: boolean) => {
                                const options = {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                  shouldValidate: true,
                                }
                                checked
                                  ? form.setValue(
                                      'paidFor',
                                      [
                                        ...field.value,
                                        { participant: id, shares: 1 },
                                      ],
                                      options,
                                    )
                                  : form.setValue(
                                      'paidFor',
                                      field.value?.filter(
                                        (value: any) =>
                                          value.participant !== id,
                                      ),
                                      options,
                                    )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="text-sm font-normal flex-1">
                            {name}
                            {field.value?.some(
                              ({ participant }: any) => participant === id,
                            ) &&
                              !form.watch('isReimbursement') && (
                                <span className="text-muted-foreground ml-2">
                                  (
                                  {formatCurrency(
                                    groupCurrency,
                                    calculateShare(id, {
                                      amount: amountAsMinorUnits(
                                        Number(form.watch('amount')),
                                        groupCurrency,
                                      ),
                                      paidFor: field.value.map(
                                        ({ participant, shares }: any) => ({
                                          user: {
                                            id: participant,
                                            name: '',
                                          },
                                          shares:
                                            form.watch('splitMode') ===
                                            'BY_PERCENTAGE'
                                              ? Number(shares) * 100
                                              : form.watch('splitMode') ===
                                                  'BY_AMOUNT'
                                                ? amountAsMinorUnits(
                                                    shares,
                                                    groupCurrency,
                                                  )
                                                : shares,
                                        }),
                                      ),
                                      splitMode: form.watch('splitMode'),
                                      isReimbursement:
                                        form.watch('isReimbursement'),
                                    }),
                                    locale,
                                  )}
                                  )
                                </span>
                              )}
                          </FormLabel>
                        </FormItem>
                        <div className="flex">
                          {form.getValues().splitMode === 'BY_AMOUNT' &&
                            !!conversionRequired && (
                              <OriginalAmountInput
                                id={id}
                                field={field}
                                form={form}
                                originalCurrency={originalCurrency}
                                groupCurrency={groupCurrency}
                                exchangeRate={exchangeRate}
                                setManuallyEditedParticipants={
                                  setManuallyEditedParticipants
                                }
                              />
                            )}
                          {form.getValues().splitMode !== 'EVENLY' && (
                            <SharesInput
                              id={id}
                              field={field}
                              form={form}
                              group={group}
                              groupCurrency={groupCurrency}
                              setManuallyEditedParticipants={
                                setManuallyEditedParticipants
                              }
                              t={t}
                            />
                          )}
                        </div>
                      </div>
                    )
                  }}
                />
              ))}

              {/* Former members still in expense paidFor */}
              {expense &&
                expense.paidFor
                  .filter(
                    (pf: any) =>
                      !group.participants.some((p: any) => p.id === pf.userId),
                  )
                  .map((pf: any) => (
                    <FormField
                      key={pf.userId}
                      control={form.control}
                      name="paidFor"
                      render={({ field }: any) => (
                        <div className="flex flex-wrap gap-y-4 items-center border-t last-of-type:border-b last-of-type:!mb-4 -mx-6 px-6 py-3">
                          <FormItem className="flex-1 flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.some(
                                  ({ participant }: any) =>
                                    participant === pf.userId,
                                )}
                                onCheckedChange={(checked: boolean) => {
                                  const options = {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                  }
                                  checked
                                    ? form.setValue(
                                        'paidFor',
                                        [
                                          ...field.value,
                                          {
                                            participant: pf.userId,
                                            shares: 1,
                                          },
                                        ],
                                        options,
                                      )
                                    : form.setValue(
                                        'paidFor',
                                        field.value?.filter(
                                          (value: any) =>
                                            value.participant !== pf.userId,
                                        ),
                                        options,
                                      )
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal flex-1">
                              {pf.user?.name ?? 'Unknown user'}
                              {field.value?.some(
                                ({ participant }: any) =>
                                  participant === pf.userId,
                              ) &&
                                !form.watch('isReimbursement') && (
                                  <span className="text-muted-foreground ml-2">
                                    (
                                    {formatCurrency(
                                      groupCurrency,
                                      calculateShare(pf.userId, {
                                        amount: amountAsMinorUnits(
                                          Number(form.watch('amount')),
                                          groupCurrency,
                                        ),
                                        paidFor: field.value.map(
                                          ({ participant, shares }: any) => ({
                                            user: {
                                              id: participant,
                                              name: '',
                                            },
                                            shares:
                                              form.watch('splitMode') ===
                                              'BY_PERCENTAGE'
                                                ? Number(shares) * 100
                                                : form.watch('splitMode') ===
                                                    'BY_AMOUNT'
                                                  ? amountAsMinorUnits(
                                                      shares,
                                                      groupCurrency,
                                                    )
                                                  : shares,
                                          }),
                                        ),
                                        splitMode: form.watch('splitMode'),
                                        isReimbursement:
                                          form.watch('isReimbursement'),
                                      }),
                                      locale,
                                    )}
                                    )
                                  </span>
                                )}
                              <span className="ml-2 text-xs text-muted-foreground italic">
                                ({t('noLongerInGroup')})
                              </span>
                            </FormLabel>
                          </FormItem>
                        </div>
                      )}
                    />
                  ))}

              <FormMessage />
            </FormItem>
          )}
        />

        {/* Advanced split options */}
        <Collapsible
          className="mt-5"
          defaultOpen={form.getValues().splitMode !== 'EVENLY'}
        >
          <CollapsibleTrigger asChild>
            <Button variant="link" type="button" className="-mx-4">
              {t('advancedOptions')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:gap-6 pt-3">
              <FormField
                control={form.control}
                name="splitMode"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>{t('SplitModeField.label')}</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={(value) => {
                          form.setValue('splitMode', value as any, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }}
                        defaultValue={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EVENLY">
                            {t('SplitModeField.evenly')}
                          </SelectItem>
                          <SelectItem value="BY_SHARES">
                            {t('SplitModeField.byShares')}
                          </SelectItem>
                          <SelectItem value="BY_PERCENTAGE">
                            {t('SplitModeField.byPercentage')}
                          </SelectItem>
                          <SelectItem value="BY_AMOUNT">
                            {t('SplitModeField.byAmount')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      {t(`${sExpense}.splitModeDescription`)}
                    </FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="saveDefaultSplittingOptions"
                render={({ field }: any) => (
                  <FormItem className="flex flex-row gap-2 items-center space-y-0 pt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div>
                      <FormLabel>{t('SplitModeField.saveAsDefault')}</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// ─── Participant Original Amount Input ───────────────────────────────────────

function OriginalAmountInput({
  id,
  field,
  form,
  originalCurrency,
  groupCurrency,
  exchangeRate,
  setManuallyEditedParticipants,
}: any) {
  const sharesLabel = (
    <span
      className={cn('text-sm', {
        'text-muted': !field.value?.some(
          ({ participant }: any) => participant === id,
        ),
      })}
    >
      {originalCurrency.symbol}
    </span>
  )

  return (
    <div>
      <div className="flex gap-1 items-center">
        {sharesLabel}
        <FormControl>
          <Input
            key={String(
              !field.value?.some(({ participant }: any) => participant === id),
            )}
            className="text-base w-[80px] -my-2"
            type="text"
            inputMode="decimal"
            disabled={
              !field.value?.some(({ participant }: any) => participant === id)
            }
            value={
              field.value.find(({ participant }: any) => participant === id)
                ?.originalAmount ?? ''
            }
            onChange={(event: any) => {
              const originalAmount = Number(event.target.value)
              let convertedAmount = ''
              if (!Number.isNaN(originalAmount) && exchangeRate.data) {
                convertedAmount = (originalAmount * exchangeRate.data).toFixed(
                  groupCurrency.decimal_digits,
                )
              }
              field.onChange(
                field.value.map((p: any) =>
                  p.participant === id
                    ? {
                        participant: id,
                        originalAmount: event.target.value,
                        shares: enforceCurrencyPattern(convertedAmount),
                      }
                    : p,
                ),
              )
              setManuallyEditedParticipants((prev: Set<string>) =>
                new Set(prev).add(id),
              )
            }}
            step={10 ** -originalCurrency.decimal_digits}
          />
        </FormControl>
        <ChevronRight className="h-4 w-4 mx-1 opacity-50" />
      </div>
    </div>
  )
}

// ─── Participant Shares Input ────────────────────────────────────────────────

function SharesInput({
  id,
  field,
  form,
  group,
  groupCurrency,
  setManuallyEditedParticipants,
  t,
}: any) {
  const sharesLabel = (
    <span
      className={cn('text-sm', {
        'text-muted': !field.value?.some(
          ({ participant }: any) => participant === id,
        ),
      })}
    >
      {match(form.getValues().splitMode)
        .with('BY_SHARES', () => <>{t('shares')}</>)
        .with('BY_PERCENTAGE', () => <>%</>)
        .with('BY_AMOUNT', () => <>{group.currency}</>)
        .otherwise(() => (
          <></>
        ))}
    </span>
  )

  return (
    <div>
      <div className="flex gap-1 items-center">
        {form.getValues().splitMode === 'BY_AMOUNT' && sharesLabel}
        <FormControl>
          <Input
            key={String(
              !field.value?.some(({ participant }: any) => participant === id),
            )}
            className="text-base w-[80px] -my-2"
            type="text"
            disabled={
              !field.value?.some(({ participant }: any) => participant === id)
            }
            value={
              field.value?.find(({ participant }: any) => participant === id)
                ?.shares ?? ''
            }
            onChange={(event: any) => {
              field.onChange(
                field.value.map((p: any) =>
                  p.participant === id
                    ? {
                        participant: id,
                        shares: enforceCurrencyPattern(event.target.value),
                      }
                    : p,
                ),
              )
              setManuallyEditedParticipants((prev: Set<string>) =>
                new Set(prev).add(id),
              )
            }}
            inputMode={
              form.getValues().splitMode === 'BY_AMOUNT' ? 'decimal' : 'numeric'
            }
            step={
              form.getValues().splitMode === 'BY_AMOUNT'
                ? 10 ** -groupCurrency.decimal_digits
                : 1
            }
          />
        </FormControl>
        {['BY_SHARES', 'BY_PERCENTAGE'].includes(form.getValues().splitMode) &&
          sharesLabel}
      </div>
      <FormMessage className="float-right" />
    </div>
  )
}
