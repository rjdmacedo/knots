import { ExpenseConversionRateField } from '@/app/groups/[groupId]/expenses/expense-conversion-rate-field'
import { ExpenseFormCollapsible } from '@/app/groups/[groupId]/expenses/expense-form-collapsible'
import { CategorySelector } from '@/components/category-selector'
import { CurrencyAmountInput } from '@/components/currency-amount-input'
import { CurrencySelector } from '@/components/currency-selector'
import { DeletePopup } from '@/components/delete-popup'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { extractCategoryFromTitle } from '@/components/expense-form-actions'
import {
  ExpenseTitleInput,
  ExpenseTitleSuggestion,
} from '@/components/expense-title-input'
import { SubmitButton } from '@/components/submit-button'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { randomId } from '@/lib/api'
import { defaultCurrencyList, getCurrency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  getCurrencyDisplaySymbol,
} from '@/lib/currency-input'
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
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { match } from 'ts-pattern'

const isValidDateString = (value: string): boolean => {
  const date = new Date(value)
  return !isNaN(date.getTime())
}

function distributeEqualPercentageShares(participantCount: number): number[] {
  if (participantCount <= 0) return []
  if (participantCount === 1) return [100]

  const perPerson = Math.round((100 / participantCount) * 100) / 100
  const shares = Array.from({ length: participantCount - 1 }, () => perPerson)
  shares.push(
    Math.round((100 - perPerson * (participantCount - 1)) * 100) / 100,
  )
  return shares
}

function withEqualPercentageSplit(
  paidFor: ExpenseFormValues['paidFor'],
): ExpenseFormValues['paidFor'] {
  const percentages = distributeEqualPercentageShares(paidFor.length)
  return paidFor.map((entry, index) => ({
    ...entry,
    shares: percentages[index] ?? 0,
  }))
}

function hasOriginalAmountValue(
  originalAmount: ExpenseFormValues['originalAmount'],
): boolean {
  if (originalAmount === undefined) return false
  return Number(originalAmount) !== 0
}

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

  // if there is a participant in the default options that does not exist anymore,
  // remove the stale default splitting options
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

function getDefaultExpenseCurrency(
  group: Pick<
    NonNullable<AppRouterOutput['groups']['get']['group']>,
    'currencyCode'
  >,
  preferredCurrency?: string | null,
) {
  return preferredCurrency ?? group.currencyCode ?? undefined
}

function ExpenseFormSection({
  embedded,
  className,
  children,
}: {
  embedded?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (embedded) {
    return (
      <div
        className={cn(
          'min-w-0 space-y-4 border-t border-border pt-4 first:border-t-0 first:pt-0',
          className,
        )}
      >
        {children}
      </div>
    )
  }
  return <Card className={cn('mt-4 first:mt-0', className)}>{children}</Card>
}

function ExpenseFormSectionHeader({
  embedded,
  hideWhenEmbedded,
  children,
}: {
  embedded?: boolean
  hideWhenEmbedded?: boolean
  children: React.ReactNode
}) {
  if (embedded && hideWhenEmbedded) return null
  if (embedded) return <div className="space-y-1">{children}</div>
  return <CardHeader>{children}</CardHeader>
}

function ExpenseFormSectionTitle({
  embedded,
  className,
  children,
}: {
  embedded?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (embedded) {
    return (
      <div className={cn('font-semibold text-sm', className)}>{children}</div>
    )
  }
  return <CardTitle className={className}>{children}</CardTitle>
}

function ExpenseFormSectionDescription({
  embedded,
  children,
}: {
  embedded?: boolean
  children: React.ReactNode
}) {
  if (embedded) {
    return <p className="text-sm text-muted-foreground">{children}</p>
  }
  return <CardDescription>{children}</CardDescription>
}

function ExpenseFormSectionContent({
  embedded,
  className,
  children,
}: {
  embedded?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (embedded) {
    return <div className={className}>{children}</div>
  }
  return <CardContent className={className}>{children}</CardContent>
}

export type ExpenseFormCreatePrefill = {
  title?: string
  expenseDate?: Date
  amount?: number
  category?: number
  documents?: ExpenseFormValues['documents']
  isReimbursement?: boolean
  paidBy?: string
  paidFor?: ExpenseFormValues['paidFor']
  splitMode?: ExpenseFormValues['splitMode']
}

export function ExpenseForm({
  group,
  categories,
  expense,
  createPrefill,
  currentUserId,
  preferredCurrency,
  onSubmit,
  onDelete,
  onCancel,
  runtimeFeatureFlags,
  isDesktop = false,
  embedded = false,
  footerPortal,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  categories: AppRouterOutput['categories']['list']['categories']
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  createPrefill?: ExpenseFormCreatePrefill
  currentUserId?: string
  preferredCurrency?: string | null
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  onCancel?: () => void
  runtimeFeatureFlags: RuntimeFeatureFlags
  isDesktop?: boolean
  embedded?: boolean
  footerPortal?: HTMLElement | null
}) {
  const t = useTranslations('ExpenseForm')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
  const searchParams = useSearchParams()
  const sectionBleedX = embedded ? '' : '-mx-6 px-6'
  const linkBleedX = embedded ? '' : '-mx-4'
  const fieldsGridClass = embedded
    ? 'grid min-w-0 grid-cols-2 items-start gap-4 sm:gap-6'
    : 'grid min-w-0 grid-cols-2 items-start gap-6'

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
  const defaultExpenseCurrency = getDefaultExpenseCurrency(
    group,
    preferredCurrency,
  )
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
              // Defensive NaN check removed: shares come from DB as number; NaN would indicate data corruption.
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
            originalCurrency: defaultExpenseCurrency,
            originalAmount: undefined,
            conversionRate: undefined,
            category: 1, // category with id 1 is Payment
            paidBy: searchParams.get('from') ?? undefined,
            paidFor: searchParams.get('to')
              ? [
                  {
                    participant: searchParams.get('to')!,
                    shares: amountAsDecimal(
                      Number(searchParams.get('amount')) || 0,
                      groupCurrency,
                    ),
                  },
                ]
              : [],
            isReimbursement: true,
            splitMode: 'BY_AMOUNT',
            saveDefaultSplittingOptions: false,
            documents: [],
            notes: '',
            recurrenceRule: RecurrenceRule.NONE,
          }
        : createPrefill
          ? {
              title:
                createPrefill.title ??
                (createPrefill.isReimbursement ? t('reimbursement') : ''),
              expenseDate: createPrefill.expenseDate ?? new Date(),
              amount: createPrefill.amount ?? 0,
              originalCurrency: defaultExpenseCurrency,
              originalAmount: undefined,
              conversionRate: undefined,
              category:
                createPrefill.category ??
                (createPrefill.isReimbursement ? 1 : 0),
              paidBy: createPrefill.paidBy ?? getDefaultPaidBy(),
              paidFor: createPrefill.paidFor ?? defaultSplittingOptions.paidFor,
              isReimbursement: createPrefill.isReimbursement ?? false,
              splitMode:
                createPrefill.splitMode ?? defaultSplittingOptions.splitMode,
              saveDefaultSplittingOptions: false,
              documents: createPrefill.documents ?? [],
              notes: '',
              recurrenceRule: RecurrenceRule.NONE,
            }
          : {
              title: searchParams.get('title') ?? '',
              expenseDate: searchParams.get('date')
                ? new Date(searchParams.get('date') as string)
                : new Date(),
              amount: Number(searchParams.get('amount')) || 0,
              originalCurrency: defaultExpenseCurrency,
              originalAmount: undefined,
              conversionRate: undefined,
              category: searchParams.get('categoryId')
                ? Number(searchParams.get('categoryId'))
                : 0, // category with id 0 is "General"
              // paid for all, split evenly
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
  const seenParticipantIdsRef = useRef<Set<string>>(
    new Set(group.participants.map((p) => p.id)),
  )

  useEffect(() => {
    const currentPaidFor = form.getValues('paidFor') || []
    let updatedPaidFor = [...currentPaidFor]
    let hasChanges = false

    // 1. Add newly added participants
    group.participants.forEach((p) => {
      if (!seenParticipantIdsRef.current.has(p.id)) {
        seenParticipantIdsRef.current.add(p.id)
        if (!currentPaidFor.some((pf) => pf.participant === p.id)) {
          updatedPaidFor.push({
            participant: p.id,
            shares: 1,
          })
          hasChanges = true
        }
      }
    })

    // 2. Remove participants that are no longer in group.participants (in create mode)
    if (!expense) {
      const activeIds = new Set(group.participants.map((p) => p.id))
      const beforeLength = updatedPaidFor.length
      updatedPaidFor = updatedPaidFor.filter((pf) => {
        const keep = activeIds.has(pf.participant)
        if (!keep) {
          seenParticipantIdsRef.current.delete(pf.participant)
        }
        return keep
      })
      if (updatedPaidFor.length !== beforeLength) {
        hasChanges = true
      }
    }

    if (hasChanges) {
      const paidForToSet =
        form.getValues('splitMode') === 'BY_PERCENTAGE'
          ? withEqualPercentageSplit(updatedPaidFor)
          : updatedPaidFor
      form.setValue('paidFor', paidForToSet, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
    }
  }, [group.participants, form, expense])

  const [isCategoryLoading, setCategoryLoading] = useState(false)
  const activeUserId = useActiveUser(group.id)
  const utils = trpc.useUtils()
  const uploadPendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)
  const deletePendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)

  const submit = async (values: ExpenseFormValues) => {
    // Upload pending documents before submitting
    if (uploadPendingDocumentsRef.current) {
      try {
        await uploadPendingDocumentsRef.current()
        // Update values with the latest documents from form state
        values.documents = form.getValues('documents')
      } catch (err) {
        // If upload fails, don't proceed with submission
        throw err
      }
    }

    await persistDefaultSplittingOptions(group.id, values)

    // Store monetary amounts in minor units (cents)
    values.amount = amountAsMinorUnits(values.amount, groupCurrency)
    values.paidFor = values.paidFor.map(({ participant, shares }) => ({
      participant,
      shares:
        values.splitMode === 'BY_AMOUNT'
          ? amountAsMinorUnits(shares, groupCurrency)
          : shares,
    }))

    // Currency should be blank if the same as group currency
    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
    }

    // Submit the form first
    await onSubmit(values, activeUserId ?? undefined)

    // Delete marked documents from S3 after successful form submission
    // We do this after submission so if submission fails, documents aren't deleted
    if (deletePendingDocumentsRef.current) {
      try {
        await deletePendingDocumentsRef.current()
      } catch (err) {
        // Log error but don't fail since the form data is already saved
        console.error('Failed to delete documents from S3:', err)
      }
    }
  }

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

  const amount = form.watch('amount')
  const splitMode = form.watch('splitMode')

  useEffect(() => {
    setManuallyEditedParticipants(new Set())
  }, [splitMode, amount])

  useEffect(() => {
    const splitMode = form.getValues().splitMode

    // Only auto-balance for split mode 'Unevenly - By amount'
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
  const savedCustomConversionRateRef = useRef<number | undefined>(
    usingCustomConversionRate
      ? (form.formState.defaultValues?.conversionRate as number | undefined)
      : undefined,
  )

  const handleCustomConversionRateChange = (enabled: boolean) => {
    if (enabled) {
      const rate =
        savedCustomConversionRateRef.current ??
        form.getValues('conversionRate') ??
        exchangeRate.data
      if (rate != null) {
        form.setValue('conversionRate', rate, { shouldValidate: true })
      }
    } else {
      const current = form.getValues('conversionRate')
      if (current != null) {
        savedCustomConversionRateRef.current = Number(current) || undefined
      }
      if (exchangeRate.data) {
        form.setValue('conversionRate', exchangeRate.data, {
          shouldValidate: true,
        })
      }
    }
    setUsingCustomConversionRate(enabled)
  }

  const prevConversionRequiredRef = useRef(conversionRequired)
  const pendingAmountConversionRef = useRef(false)

  useEffect(() => {
    const becameRequired =
      conversionRequired && !prevConversionRequiredRef.current
    const becameOptional =
      !conversionRequired && prevConversionRequiredRef.current
    prevConversionRequiredRef.current = conversionRequired

    if (becameRequired) {
      const amount = Number(form.getValues('amount'))
      const originalAmount = form.getValues('originalAmount')

      if (amount !== 0 && !hasOriginalAmountValue(originalAmount)) {
        form.setValue('originalAmount', amount, {
          shouldDirty: true,
          shouldTouch: true,
        })
        pendingAmountConversionRef.current = true
      }
    }

    if (becameOptional) {
      pendingAmountConversionRef.current = false
      form.setValue('originalAmount', undefined)
      form.setValue('conversionRate', undefined)
    }
  }, [conversionRequired, form])

  useEffect(() => {
    if (!usingCustomConversionRate && exchangeRate.data) {
      form.setValue('conversionRate', exchangeRate.data)
    }
  }, [exchangeRate.data, usingCustomConversionRate, form])

  const originalAmount = form.watch('originalAmount')
  const conversionRate = form.watch('conversionRate')
  const originalAmountFieldState = form.getFieldState('originalAmount')

  useEffect(() => {
    if (!conversionRequired) return

    const shouldConvert =
      pendingAmountConversionRef.current || originalAmountFieldState.isTouched
    if (!shouldConvert) return

    const originalAmountValue = form.getValues('originalAmount') ?? 0
    const conversionRateValue = form.getValues('conversionRate')

    if (conversionRateValue && originalAmountValue) {
      const rate = Number(conversionRateValue)
      const convertedAmount = Number(originalAmountValue) * rate
      if (!Number.isNaN(convertedAmount)) {
        const v = enforceCurrencyPattern(
          convertedAmount.toFixed(groupCurrency.decimal_digits),
        )
        const income = Number(v) < 0
        setIsIncome(income)
        if (income) form.setValue('isReimbursement', false)
        form.setValue('amount', Number(v), { shouldValidate: true })
        pendingAmountConversionRef.current = false
      }
    }
  }, [
    form,
    conversionRequired,
    originalAmount,
    conversionRate,
    groupCurrency.decimal_digits,
    originalAmountFieldState.isTouched,
  ])

  const formFooter = (
    <DialogFooter
      className={cn(
        'border-t bg-popover shrink-0',
        embedded
          ? footerPortal
            ? 'flex flex-col-reverse gap-2 border-t-0 bg-transparent pt-0 sm:flex-row sm:justify-end'
            : 'px-0 pt-4 pb-0'
          : 'p-6',
      )}
    >
      <SubmitButton
        form="expense-form"
        loadingContent={t(isCreate ? 'creating' : 'saving')}
      >
        <Save className="w-4 h-4 mr-2" />
        {t(isCreate ? 'create' : 'save')}
      </SubmitButton>
      {!isCreate && onDelete && (
        <DeletePopup
          onDelete={() => onDelete(activeUserId ?? undefined)}
        ></DeletePopup>
      )}
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      ) : (
        <Link
          href={`/groups/${group.id}`}
          className={buttonVariants({ variant: 'ghost' })}
        >
          {t('cancel')}
        </Link>
      )}
    </DialogFooter>
  )

  return (
    <Form {...form}>
      <form
        id="expense-form"
        onSubmit={form.handleSubmit(submit)}
        className="flex min-w-0 flex-col flex-1 min-h-0 overflow-hidden @container"
      >
        <div
          className={cn(
            'min-w-0 flex-1 space-y-4 overflow-x-hidden',
            embedded ? 'py-2' : 'overflow-y-auto scrollbar-none px-6 py-4',
          )}
        >
          <ExpenseFormSection embedded={embedded}>
            <ExpenseFormSectionHeader embedded={embedded} hideWhenEmbedded>
              <ExpenseFormSectionTitle embedded={embedded}>
                {t(`${sExpense}.${isCreate ? 'create' : 'edit'}`)}
              </ExpenseFormSectionTitle>
            </ExpenseFormSectionHeader>
            <ExpenseFormSectionContent
              embedded={embedded}
              className={fieldsGridClass}
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="">
                    <FormLabel>{t(`${sExpense}.TitleField.label`)}</FormLabel>
                    <FormControl>
                      <ExpenseTitleInput
                        groupId={group.id}
                        value={field.value}
                        onChange={(val) => {
                          field.onChange(val)
                        }}
                        onSuggestionSelected={(
                          suggestion: ExpenseTitleSuggestion,
                        ) => {
                          form.setValue('category', suggestion.categoryId)
                        }}
                        onBlur={async () => {
                          field.onBlur()

                          // 1. Try lookup from category mapping (has priority over AI)
                          try {
                            if (field.value.trim().length > 0) {
                              const { categoryId: mappedCategoryId } =
                                await utils.groups.expenses.lookupCategory.fetch(
                                  {
                                    groupId: group.id,
                                    title: field.value,
                                  },
                                )

                              if (mappedCategoryId !== null) {
                                form.setValue('category', mappedCategoryId)
                                return
                              }
                            }
                          } catch {
                            // Silently fall through to existing behavior
                          }

                          // 2. Fallback to AI extraction (if enabled)
                          if (runtimeFeatureFlags.enableCategoryExtract) {
                            setCategoryLoading(true)
                            const { categoryId } =
                              await extractCategoryFromTitle(field.value)
                            form.setValue('category', categoryId)
                            setCategoryLoading(false)
                          }
                        }}
                        placeholder={t(`${sExpense}.TitleField.placeholder`)}
                        className="text-base"
                      />
                    </FormControl>
                    <FormDescription>
                      {t(`${sExpense}.TitleField.description`)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(`${sExpense}.DateField.label`)}</FormLabel>
                    <FormControl>
                      <Input
                        className="date-base"
                        type="date"
                        value={formatDate(field.value)}
                        onChange={(event) => {
                          const value = event.target.value
                          if (!value) {
                            // If the input is cleared, set to null (or handle as appropriate for your schema)
                            field.onChange(null)
                          } else if (isValidDateString(value)) {
                            field.onChange(new Date(value))
                          }
                          // If invalid, do not update the field (prevents resetting today)
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

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('categoryField.label')}</FormLabel>
                    <CategorySelector
                      categories={categories}
                      defaultValue={
                        form.watch(field.name) // may be overwritten externally
                      }
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

              <FormField
                control={form.control}
                name="paidBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(`${sExpense}.paidByField.label`)}</FormLabel>
                    <Select
                      items={group.participants.map(({ id, name }) => ({
                        value: id,
                        label: name,
                      }))}
                      onValueChange={field.onChange}
                      value={field.value ?? getDefaultPaidBy()}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t(`${sExpense}.paidByField.placeholder`)}
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
                    <FormDescription>
                      {t(`${sExpense}.paidByField.description`)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {conversionRequired ? (
                <FormField
                  control={form.control}
                  name="originalAmount"
                  render={({
                    field: { onChange, onBlur, ref, name, value },
                  }) => (
                    <FormItem>
                      <FormLabel>{t('originalAmountField.label')}</FormLabel>
                      <FormControl>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            <CurrencySelector
                              variant="inline"
                              currencies={defaultCurrencyList(locale, '')}
                              defaultValue={
                                form.watch('originalCurrency') ?? ''
                              }
                              isLoading={false}
                              onValueChange={(v) =>
                                form.setValue('originalCurrency', v)
                              }
                            />
                          </InputGroupAddon>
                          <CurrencyAmountInput
                            ref={ref}
                            name={name}
                            onBlur={onBlur}
                            currency={originalCurrency}
                            locale={locale}
                            value={value}
                            onValueChange={onChange}
                          />
                        </InputGroup>
                      </FormControl>
                      <FormDescription>
                        {t('originalAmountField.description')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({
                    field: { onChange, onBlur, ref, name, value },
                  }) => (
                    <FormItem>
                      <FormLabel>{t('amountField.label')}</FormLabel>
                      <FormControl>
                        <InputGroup>
                          <InputGroupAddon align="inline-start">
                            {group.currencyCode ? (
                              <CurrencySelector
                                variant="inline"
                                currencies={defaultCurrencyList(locale, '')}
                                defaultValue={
                                  form.watch('originalCurrency') ?? ''
                                }
                                isLoading={false}
                                onValueChange={(v) =>
                                  form.setValue('originalCurrency', v)
                                }
                              />
                            ) : (
                              <InputGroupText className="tabular-nums">
                                {getCurrencyDisplaySymbol(groupCurrency)}
                              </InputGroupText>
                            )}
                          </InputGroupAddon>
                          <CurrencyAmountInput
                            ref={ref}
                            name={name}
                            onBlur={onBlur}
                            currency={originalCurrency}
                            locale={locale}
                            value={value}
                            onValueChange={(v) => {
                              const income = Number(v) < 0
                              setIsIncome(income)
                              if (income)
                                form.setValue('isReimbursement', false)
                              onChange(v)
                            }}
                          />
                        </InputGroup>
                      </FormControl>
                      <FormDescription>
                        {t('amountField.description')}
                      </FormDescription>
                      {!group.currencyCode && (
                        <FormDescription>
                          {t('conversionUnavailable')}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {conversionRequired && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({
                    field: { onChange, onBlur, ref, name, value },
                  }) => (
                    <FormItem>
                      <FormLabel>{t('amountField.label')}</FormLabel>
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
                            onValueChange={(v) => {
                              const income = Number(v) < 0
                              setIsIncome(income)
                              if (income)
                                form.setValue('isReimbursement', false)
                              onChange(v)
                            }}
                          />
                        </InputGroup>
                      </FormControl>
                      <FormDescription>
                        {t('amountField.convertedDescription')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="recurrenceRule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t(`${sExpense}.recurrenceRule.label`)}
                    </FormLabel>
                    <Select
                      items={[
                        {
                          value: 'NONE',
                          label: t(`${sExpense}.recurrenceRule.none`),
                        },
                        {
                          value: 'DAILY',
                          label: t(`${sExpense}.recurrenceRule.daily`),
                        },
                        {
                          value: 'WEEKLY',
                          label: t(`${sExpense}.recurrenceRule.weekly`),
                        },
                        {
                          value: 'MONTHLY',
                          label: t(`${sExpense}.recurrenceRule.monthly`),
                        },
                      ]}
                      onValueChange={(value) => {
                        form.setValue('recurrenceRule', value as RecurrenceRule)
                      }}
                      value={getSelectedRecurrenceRule(field)}
                    >
                      <SelectTrigger className="w-full">
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

              {conversionRequired && (
                <ExpenseConversionRateField
                  control={form.control}
                  originalCurrency={originalCurrency}
                  groupCurrency={groupCurrency}
                  exchangeRate={exchangeRate.data}
                  usingCustomRate={usingCustomConversionRate}
                  onUsingCustomRateChange={handleCustomConversionRateChange}
                  onCustomRateChange={(value) => {
                    savedCustomConversionRateRef.current =
                      Number(value) || undefined
                  }}
                  isLoading={exchangeRate.isLoading}
                  exchangeError={exchangeRate.error}
                  onRefresh={() => exchangeRate.refresh()}
                  className={cn(group.id === 'direct' && 'col-start-2')}
                />
              )}
            </ExpenseFormSectionContent>
          </ExpenseFormSection>

          <ExpenseFormSection embedded={embedded}>
            <ExpenseFormSectionHeader embedded={embedded}>
              <ExpenseFormSectionTitle
                embedded={embedded}
                className="flex justify-between"
              >
                <span>{t(`${sExpense}.paidFor.title`)}</span>
                <Button
                  variant="link"
                  type="button"
                  className={cn('-my-2', linkBleedX)}
                  onClick={() => {
                    const paidFor = form.getValues().paidFor
                    const allSelected =
                      paidFor.length === group.participants.length
                    const newPaidFor = allSelected
                      ? []
                      : group.participants.map((p) => ({
                          participant: p.id,
                          shares:
                            paidFor.find((pfor) => pfor.participant === p.id)
                              ?.shares ?? 1,
                        }))
                    form.setValue('paidFor', newPaidFor, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }}
                >
                  {form.getValues().paidFor.length ===
                  group.participants.length ? (
                    <>{t('selectNone')}</>
                  ) : (
                    <>{t('selectAll')}</>
                  )}
                </Button>
              </ExpenseFormSectionTitle>
              <ExpenseFormSectionDescription embedded={embedded}>
                {t(`${sExpense}.paidFor.description`)}
              </ExpenseFormSectionDescription>
            </ExpenseFormSectionHeader>
            <ExpenseFormSectionContent embedded={embedded}>
              <FormField
                control={form.control}
                name="paidFor"
                render={() => (
                  <FormItem className="sm:order-4 row-span-2 space-y-0">
                    {group.participants.map(({ id, name }) => (
                      <FormField
                        key={id}
                        control={form.control}
                        name="paidFor"
                        render={({ field }) => {
                          return (
                            <div
                              data-id={`${id}/${form.getValues().splitMode}/${
                                group.currency
                              }`}
                              className={cn(
                                'flex flex-wrap gap-y-4 items-center border-t py-3',
                                sectionBleedX,
                              )}
                            >
                              <FormItem className="flex-1 flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.some(
                                      ({ participant }) => participant === id,
                                    )}
                                    onCheckedChange={(checked) => {
                                      const options = {
                                        shouldDirty: true,
                                        shouldTouch: true,
                                        shouldValidate: true,
                                      }
                                      let newPaidFor = checked
                                        ? [
                                            ...field.value,
                                            {
                                              participant: id,
                                              shares: 1,
                                            },
                                          ]
                                        : field.value?.filter(
                                            (value) => value.participant !== id,
                                          )

                                      if (
                                        form.getValues('splitMode') ===
                                        'BY_PERCENTAGE'
                                      ) {
                                        newPaidFor = withEqualPercentageSplit(
                                          newPaidFor ?? [],
                                        )
                                        setManuallyEditedParticipants(new Set())
                                      }

                                      form.setValue(
                                        'paidFor',
                                        newPaidFor,
                                        options,
                                      )
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal flex-1">
                                  {name}
                                  {field.value?.some(
                                    ({ participant }) => participant === id,
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
                                            ), // Convert to cents
                                            paidFor: field.value.map(
                                              ({ participant, shares }) => ({
                                                user: {
                                                  id: participant,
                                                  name: '',
                                                },
                                                shares:
                                                  form.watch('splitMode') ===
                                                  'BY_PERCENTAGE'
                                                    ? Number(shares) * 100 // Convert percentage to basis points (e.g. 50% -> 5000)
                                                    : form.watch(
                                                          'splitMode',
                                                        ) === 'BY_AMOUNT'
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
                                    <FormField
                                      name={`paidFor[${field.value.findIndex(
                                        ({ participant }) => participant === id,
                                      )}].originalAmount`}
                                      render={() => {
                                        const sharesLabel = (
                                          <span
                                            className={cn('text-sm', {
                                              'text-muted': !field.value?.some(
                                                ({ participant }) =>
                                                  participant === id,
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
                                                    !field.value?.some(
                                                      ({ participant }) =>
                                                        participant === id,
                                                    ),
                                                  )}
                                                  className="text-base w-[80px] -my-2"
                                                  type="text"
                                                  inputMode="decimal"
                                                  disabled={
                                                    !field.value?.some(
                                                      ({ participant }) =>
                                                        participant === id,
                                                    )
                                                  }
                                                  value={
                                                    field.value.find(
                                                      ({ participant }) =>
                                                        participant === id,
                                                    )?.originalAmount ?? ''
                                                  }
                                                  onChange={(event) => {
                                                    const originalAmount =
                                                      Number(event.target.value)
                                                    let convertedAmount = ''
                                                    if (
                                                      !Number.isNaN(
                                                        originalAmount,
                                                      ) &&
                                                      exchangeRate.data
                                                    ) {
                                                      convertedAmount = (
                                                        originalAmount *
                                                        exchangeRate.data
                                                      ).toFixed(
                                                        groupCurrency.decimal_digits,
                                                      )
                                                    }
                                                    field.onChange(
                                                      field.value.map((p) =>
                                                        p.participant === id
                                                          ? {
                                                              participant: id,
                                                              originalAmount:
                                                                event.target
                                                                  .value,
                                                              shares:
                                                                enforceCurrencyPattern(
                                                                  convertedAmount,
                                                                ),
                                                            }
                                                          : p,
                                                      ),
                                                    )
                                                    setManuallyEditedParticipants(
                                                      (prev) =>
                                                        new Set(prev).add(id),
                                                    )
                                                  }}
                                                  step={
                                                    10 **
                                                    -originalCurrency.decimal_digits
                                                  }
                                                />
                                              </FormControl>
                                              <ChevronRight className="h-4 w-4 mx-1 opacity-50" />
                                            </div>
                                          </div>
                                        )
                                      }}
                                    />
                                  )}
                                {form.getValues().splitMode !== 'EVENLY' && (
                                  <FormField
                                    name={`paidFor[${field.value.findIndex(
                                      ({ participant }) => participant === id,
                                    )}].shares`}
                                    render={() => {
                                      const sharesLabel = (
                                        <span
                                          className={cn('text-sm', {
                                            'text-muted': !field.value?.some(
                                              ({ participant }) =>
                                                participant === id,
                                            ),
                                          })}
                                        >
                                          {match(form.getValues().splitMode)
                                            .with('BY_SHARES', () => (
                                              <>{t('shares')}</>
                                            ))
                                            .with('BY_PERCENTAGE', () => <>%</>)
                                            .with('BY_AMOUNT', () => (
                                              <>{group.currency}</>
                                            ))
                                            .otherwise(() => (
                                              <></>
                                            ))}
                                        </span>
                                      )
                                      return (
                                        <div>
                                          <div className="flex gap-1 items-center">
                                            {form.getValues().splitMode ===
                                              'BY_AMOUNT' && sharesLabel}
                                            <FormControl>
                                              <Input
                                                key={String(
                                                  !field.value?.some(
                                                    ({ participant }) =>
                                                      participant === id,
                                                  ),
                                                )}
                                                className="text-base w-[80px] -my-2"
                                                type="text"
                                                disabled={
                                                  !field.value?.some(
                                                    ({ participant }) =>
                                                      participant === id,
                                                  )
                                                }
                                                value={
                                                  field.value?.find(
                                                    ({ participant }) =>
                                                      participant === id,
                                                  )?.shares ?? ''
                                                }
                                                onChange={(event) => {
                                                  field.onChange(
                                                    field.value.map((p) =>
                                                      p.participant === id
                                                        ? {
                                                            participant: id,
                                                            shares:
                                                              enforceCurrencyPattern(
                                                                event.target
                                                                  .value,
                                                              ),
                                                          }
                                                        : p,
                                                    ),
                                                  )
                                                  setManuallyEditedParticipants(
                                                    (prev) =>
                                                      new Set(prev).add(id),
                                                  )
                                                }}
                                                inputMode={
                                                  form.getValues().splitMode ===
                                                  'BY_AMOUNT'
                                                    ? 'decimal'
                                                    : 'numeric'
                                                }
                                                step={
                                                  form.getValues().splitMode ===
                                                  'BY_AMOUNT'
                                                    ? 10 **
                                                      -groupCurrency.decimal_digits
                                                    : 1
                                                }
                                              />
                                            </FormControl>
                                            {[
                                              'BY_SHARES',
                                              'BY_PERCENTAGE',
                                            ].includes(
                                              form.getValues().splitMode,
                                            ) && sharesLabel}
                                          </div>
                                          <FormMessage className="float-right" />
                                        </div>
                                      )
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                          )
                        }}
                      />
                    ))}

                    {/* Show former members still in this expense's paidFor (can be unchecked to remove) */}
                    {expense &&
                      expense.paidFor
                        .filter(
                          (pf) =>
                            !group.participants.some((p) => p.id === pf.userId),
                        )
                        .map((pf) => (
                          <FormField
                            key={pf.userId}
                            control={form.control}
                            name="paidFor"
                            render={({ field }) => (
                              <div
                                className={cn(
                                  'flex flex-wrap gap-y-4 items-center border-t py-3',
                                  sectionBleedX,
                                )}
                              >
                                <FormItem className="flex-1 flex flex-row items-start space-x-3 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.some(
                                        ({ participant }) =>
                                          participant === pf.userId,
                                      )}
                                      onCheckedChange={(checked) => {
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
                                                (value) =>
                                                  value.participant !==
                                                  pf.userId,
                                              ),
                                              options,
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal flex-1">
                                    {pf.user?.name ?? 'Unknown user'}
                                    {field.value?.some(
                                      ({ participant }) =>
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
                                                ({ participant, shares }) => ({
                                                  user: {
                                                    id: participant,
                                                    name: '',
                                                  },
                                                  shares:
                                                    form.watch('splitMode') ===
                                                    'BY_PERCENTAGE'
                                                      ? Number(shares) * 100
                                                      : form.watch(
                                                            'splitMode',
                                                          ) === 'BY_AMOUNT'
                                                        ? amountAsMinorUnits(
                                                            shares,
                                                            groupCurrency,
                                                          )
                                                        : shares,
                                                }),
                                              ),
                                              splitMode:
                                                form.watch('splitMode'),
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
            </ExpenseFormSectionContent>
          </ExpenseFormSection>

          <ExpenseFormSection embedded={embedded}>
            <div className="flex flex-col gap-2">
              <ExpenseFormCollapsible
                title={t('notesField.label')}
                description={t(`${sExpense}.notesDescription`)}
                defaultOpen={Boolean(expense?.notes?.trim())}
              >
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea className="text-base" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ExpenseFormCollapsible>

              <ExpenseFormCollapsible
                title={t('advancedOptions')}
                description={t(`${sExpense}.splitModeDescription`)}
                defaultOpen={form.getValues().splitMode !== 'EVENLY'}
              >
                <div className={cn('grid', fieldsGridClass)}>
                  <FormField
                    control={form.control}
                    name="splitMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('SplitModeField.label')}</FormLabel>
                        <FormControl>
                          <Select
                            items={[
                              {
                                value: 'EVENLY',
                                label: t('SplitModeField.evenly'),
                              },
                              {
                                value: 'BY_SHARES',
                                label: t('SplitModeField.byShares'),
                              },
                              {
                                value: 'BY_PERCENTAGE',
                                label: t('SplitModeField.byPercentage'),
                              },
                              {
                                value: 'BY_AMOUNT',
                                label: t('SplitModeField.byAmount'),
                              },
                            ]}
                            onValueChange={(value) => {
                              const splitMode =
                                value as ExpenseFormValues['splitMode']

                              if (splitMode === 'BY_PERCENTAGE') {
                                const paidFor = form.getValues('paidFor') ?? []
                                form.setValue(
                                  'paidFor',
                                  withEqualPercentageSplit(paidFor),
                                  {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                  },
                                )
                                setManuallyEditedParticipants(new Set())
                              }

                              form.setValue('splitMode', splitMode, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              })
                            }}
                            value={field.value}
                          >
                            <SelectTrigger className="w-full">
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
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="saveDefaultSplittingOptions"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-2 self-center space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {t('SplitModeField.saveAsDefault')}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </ExpenseFormCollapsible>

              {runtimeFeatureFlags.enableExpenseDocuments && (
                <ExpenseFormCollapsible
                  title={t('attachDocuments')}
                  description={t(`${sExpense}.attachDescription`)}
                  defaultOpen={Boolean(
                    expense?.documents?.length ||
                    form.getValues().documents?.length,
                  )}
                >
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
                </ExpenseFormCollapsible>
              )}
            </div>
          </ExpenseFormSection>
        </div>

        {footerPortal
          ? footerPortal && createPortal(formFooter, footerPortal)
          : formFooter}
      </form>
    </Form>
  )
}

function formatDate(date?: Date) {
  if (!date || isNaN(date as any)) date = new Date()
  return date.toISOString().substring(0, 10)
}
