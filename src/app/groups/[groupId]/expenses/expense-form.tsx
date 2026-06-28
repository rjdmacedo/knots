import { ExpenseConversionRateField } from '@/app/groups/[groupId]/expenses/expense-conversion-rate-field'
import { ExpenseFormCollapsible } from '@/app/groups/[groupId]/expenses/expense-form-collapsible'
import { CategorySelector } from '@/components/category-selector'
import { CurrencyAmountInput } from '@/components/currency-amount-input'
import {
  CurrencyFlagName,
  CurrencySelector,
} from '@/components/currency-selector'
import { DatePicker } from '@/components/date-picker'
import { DeletePopup } from '@/components/delete-popup'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { extractCategoryFromTitle } from '@/components/expense-form-actions'
import {
  ExpenseTitleInput,
  ExpenseTitleSuggestion,
} from '@/components/expense-title-input'
import { SubmitButton } from '@/components/submit-button'
import { Button, buttonVariants } from '@/components/ui/button'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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
import { defaultCurrencyList, getCurrency, type Currency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  getCurrencyDisplaySymbol,
} from '@/lib/currency-input'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useCurrencyRate, useGroupParticipantId } from '@/lib/hooks'
import {
  ExpenseFormValues,
  SplittingOptions,
  expenseFormSchema,
  toPercentageBasisPoints,
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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

/**
 * Distributes 100% equally among a given number of participants and ensures the sum of percentages is exactly 100%.
 * The final participant's share is adjusted to account for any rounding differences.
 *
 * @param participantCount The number of participants among whom the percentages are to be distributed. Must be greater than or equal to 1.
 * @return An array of numbers representing the percentage shares for each participant. Each number is rounded to two decimal places.
 */
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

/**
 * Distributes equal percentage shares among the provided entries and updates their `shares` property.
 *
 * @param {ExpenseFormValues['paidFor']} paidFor - The list of entries that will have their shares updated based on equal percentage distribution.
 * @return {ExpenseFormValues['paidFor']} The updated list of entries with equal percentage shares.
 */
function withEqualPercentageSplit(
  paidFor: ExpenseFormValues['paidFor'],
): ExpenseFormValues['paidFor'] {
  const percentages = distributeEqualPercentageShares(paidFor.length)
  return paidFor.map((entry, index) => ({
    ...entry,
    shares: percentages[index] ?? 0,
  }))
}

function distributeRemainingPercentageShares(
  remainingPercentage: number,
  participantCount: number,
): number[] {
  return distributeEqualAmountShares(remainingPercentage, participantCount, 2)
}

function balancePaidForPercentages(
  paidFor: ExpenseFormValues['paidFor'],
  editedParticipantIds: Set<string>,
): ExpenseFormValues['paidFor'] {
  const editedTotal = paidFor.reduce((sum, entry) => {
    if (!editedParticipantIds.has(entry.participant)) return sum
    return sum + (Number(entry.shares) || 0)
  }, 0)

  const uneditedCount = paidFor.length - editedParticipantIds.size
  if (uneditedCount <= 0) return paidFor

  const distributed = distributeRemainingPercentageShares(
    Math.max(0, 100 - editedTotal),
    uneditedCount,
  )

  let distributionIndex = 0
  return paidFor.map((entry) => {
    if (editedParticipantIds.has(entry.participant)) return entry
    return {
      ...entry,
      shares: distributed[distributionIndex++] ?? 0,
    }
  })
}

function areAllParticipantsInPaidFor(
  participants: { id: string }[],
  paidFor: ExpenseFormValues['paidFor'],
): boolean {
  if (participants.length === 0) return false

  return participants.every((participant) =>
    paidFor.some((entry) => entry.participant === participant.id),
  )
}

function ParticipantShareInput({
  disabled,
  value,
  onValueChange,
  className,
  splitMode,
  groupCurrency,
  locale,
  sharesLabel,
}: {
  disabled: boolean
  value: string
  onValueChange: (value: string) => void
  className?: string
  splitMode: ExpenseFormValues['splitMode']
  groupCurrency: Currency
  locale: Locale
  sharesLabel: string
}) {
  const addonClassName = cn(
    'font-medium text-foreground tabular-nums',
    disabled && 'text-muted-foreground',
  )

  return (
    <InputGroup className={className}>
      {splitMode === 'BY_AMOUNT' && (
        <InputGroupAddon align="inline-start">
          <InputGroupText className={addonClassName}>
            {getCurrencyDisplaySymbol(groupCurrency)}
          </InputGroupText>
        </InputGroupAddon>
      )}
      {splitMode === 'BY_AMOUNT' ? (
        <CurrencyAmountInput
          disabled={disabled}
          currency={groupCurrency}
          locale={locale}
          value={value}
          onValueChange={onValueChange}
          className="text-sm"
        />
      ) : (
        <InputGroupInput
          className="text-sm tabular-nums"
          type="text"
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value)
          }}
          inputMode="numeric"
          step={1}
        />
      )}
      {splitMode === 'BY_PERCENTAGE' && (
        <InputGroupAddon align="inline-end">
          <InputGroupText className={addonClassName}>%</InputGroupText>
        </InputGroupAddon>
      )}
      {splitMode === 'BY_SHARES' && (
        <InputGroupAddon align="inline-end">
          <InputGroupText className={addonClassName}>
            {sharesLabel}
          </InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

function distributeEqualAmountShares(
  totalAmount: number,
  participantCount: number,
  decimalDigits: number,
): number[] {
  if (participantCount <= 0) return []
  const factor = 10 ** decimalDigits
  const totalMinor = Math.round(totalAmount * factor)
  if (participantCount === 1) return [totalMinor / factor]

  const baseMinor = Math.floor(totalMinor / participantCount)
  const remainder = totalMinor - baseMinor * participantCount

  return Array.from({ length: participantCount }, (_, index) => {
    const minor = baseMinor + (index < remainder ? 1 : 0)
    return minor / factor
  })
}

function withEqualAmountSplit(
  paidFor: ExpenseFormValues['paidFor'],
  totalAmount: number,
  decimalDigits: number,
): ExpenseFormValues['paidFor'] {
  const amounts = distributeEqualAmountShares(
    totalAmount,
    paidFor.length,
    decimalDigits,
  )
  return paidFor.map((entry, index) => ({
    ...entry,
    shares: amounts[index] ?? 0,
  }))
}

/**
 *
 * @param originalAmount - The original amount value from the ExpenseFormValues.
 * @return Returns `true` if the original amount is defined and not 0, otherwise `false`.
 */
function hasOriginalAmountValue(
  originalAmount: ExpenseFormValues['originalAmount'],
): boolean {
  if (originalAmount === undefined) return false
  return Number(originalAmount) !== 0
}

/**
 * Retrieves the default splitting options for a given group.
 * This function determines the default splitting options either from local storage or by creating a default configuration.
 * If local storage contains outdated or invalid data, it clears the stored value and falls back to the default configuration.
 *
 * @param {NonNullable<AppRouterOutput['groups']['get']['group']>} group - The group for which the default splitting options are being retrieved.
 * @returns The splitting options including the split mode and the allocation of shares for each participant.
 * The `splitMode` specifies the method of splitting (e.g., 'EVENLY'), and `paidFor` contains an array of objects representing the participants and their respective share allocations.
 */
const getDefaultSplittingOptions = (
  group: NonNullable<AppRouterOutput['groups']['get']['group']>,
): {
  paidFor: ExpenseFormValues['paidFor']
  splitMode: SplittingOptions['splitMode']
} => {
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

/**
 * Persists the default splitting options for a specific group into local storage.
 *
 * @param {string} groupId - The unique identifier of the group for which splitting options are being saved.
 * @param {ExpenseFormValues} expenseFormValues - An object containing form values related to the expense, including split mode and paid-for information.
 * @return {Promise<void>} A promise that resolves when the default splitting options have been successfully persisted.
 */
async function persistDefaultSplittingOptions(
  groupId: string,
  expenseFormValues: ExpenseFormValues,
): Promise<void> {
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

/**
 * Determines the default expense currency based on the provided group and an optional preferred currency.
 *
 * @param {object} group - An object containing the group's currency information.
 * @param {string} group.currencyCode - The currency code associated with the group.
 * @param {string|null|undefined} [preferredCurrency] - An optional preferred currency code to override the group's currency.
 * @return {string|undefined} The preferred currency if provided, otherwise the group's currency code, or undefined if neither is available.
 */
function getDefaultExpenseCurrency(
  group: Pick<
    NonNullable<AppRouterOutput['groups']['get']['group']>,
    'currencyCode'
  >,
  preferredCurrency?: string | null,
): string | undefined {
  return preferredCurrency ?? group.currencyCode ?? undefined
}

function ExpenseFormSection({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
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

function ExpenseFormSectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>
}

function ExpenseFormSectionTitle({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('font-semibold text-sm', className)}>{children}</div>
  )
}

function ExpenseFormSectionDescription({
  children,
}: {
  children: React.ReactNode
}) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function ExpenseFormSectionContent({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={className}>{children}</div>
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

/**
 * Component for managing the creation and editing of an expense form.
 *
 * @param props - The properties for the ExpenseForm component.
 * @param props.group - Details of the group to which the expense belongs.
 * @param props.expense - Existing expense data, if editing an expense.
 * @param props.onSubmit - Function to handle form submission, receives form values and an optional participant ID.
 * @param props.onDelete - Function to handle deletion of an expense, receives an optional participant ID.
 * @param props.onCancel - Function to handle cancellation of the form.
 * @param props.categories - Available categories for the expense.
 * @param props.createPrefill - Optional pre-fill data for initializing the form.
 * @param props.currentUserId - Current user's ID.
 * @param props.preferredCurrency - Preferred currency for the expense.
 * @param props.runtimeFeatureFlags - Feature flags for enabling or disabling certain functionality.
 * @param props.isDesktop=false - Indicates whether the view is in desktop mode.
 * @return - The rendered ExpenseForm component.
 */
export function ExpenseForm({
  group,
  expense,
  onSubmit,
  onDelete,
  onCancel,
  categories,
  createPrefill,
  currentUserId,
  preferredCurrency,
  runtimeFeatureFlags,
  isDesktop = false,
  scrollHeader,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  onCancel?: () => void
  categories: AppRouterOutput['categories']['list']['categories']
  createPrefill?: ExpenseFormCreatePrefill
  currentUserId?: string
  preferredCurrency?: string | null
  runtimeFeatureFlags: RuntimeFeatureFlags
  isDesktop?: boolean
  scrollHeader?: ReactNode
}) {
  const t = useTranslations('ExpenseForm')
  const tDocuments = useTranslations('ExpenseDocumentsInput')
  const locale = useLocale() as Locale
  const isCreate = expense === undefined
  const searchParams = useSearchParams()
  const isMobileLayout = !isDesktop
  const fieldsGridClass = isMobileLayout
    ? 'grid min-w-0 grid-cols-1 items-start gap-4'
    : 'grid min-w-0 grid-cols-2 items-start gap-4 sm:gap-6'
  const participantRowClass =
    'border-t flex items-center justify-between gap-3 py-2'
  const participantFormItemClass =
    'flex min-w-0 flex-1 flex-row items-center space-x-3 space-y-0'
  const participantSharesClass = 'flex shrink-0 items-center justify-end gap-1'
  const shareInputRowClass = 'flex items-center gap-1'
  const shareInputGroupClass = 'h-8 w-[5.25rem] shrink-0'
  const collapsibleFieldsGridClass =
    'grid w-full min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-6'

  const getDefaultPaidBy = (): string | undefined => {
    if (!isCreate) return undefined

    if (
      currentUserId &&
      group.participants.some(({ id }) => id === currentUserId)
    ) {
      return currentUserId
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
  const participantId = useGroupParticipantId(group.participants)
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
          : values.splitMode === 'BY_PERCENTAGE'
            ? toPercentageBasisPoints(shares)
            : shares,
    }))

    // Currency should be blank if the same as group currency
    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
    }

    // Submit the form first
    await onSubmit(values, participantId)

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

  const watchedOriginalCurrency = form.watch('originalCurrency') ?? ''
  const originalCurrency = getCurrency(
    watchedOriginalCurrency,
    locale,
    'Custom',
  )
  const exchangeRate = useCurrencyRate(
    form.watch('expenseDate'),
    watchedOriginalCurrency,
    groupCurrency.code,
  )

  const conversionRequired =
    group.currencyCode &&
    group.currencyCode.length &&
    originalCurrency.code.length &&
    originalCurrency.code !== group.currencyCode

  const amount = form.watch('amount')
  const splitMode = form.watch('splitMode')
  const paidFor = form.watch('paidFor')
  const allParticipantsSelected = areAllParticipantsInPaidFor(
    group.participants,
    paidFor ?? [],
  )

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
      const editedParticipants = Array.from(manuallyEditedParticipants)

      let newPaidFor: ExpenseFormValues['paidFor']

      if (editedParticipants.length === 0) {
        newPaidFor = withEqualAmountSplit(
          paidFor,
          totalAmount,
          groupCurrency.decimal_digits,
        )
      } else {
        let remainingAmount = totalAmount
        let remainingParticipants = paidFor.length - editedParticipants.length

        for (const participant of paidFor) {
          if (editedParticipants.includes(participant.participant)) {
            remainingAmount -= Number(participant.shares) || 0
          }
        }

        if (remainingParticipants > 0) {
          const distributed = distributeEqualAmountShares(
            remainingAmount,
            remainingParticipants,
            groupCurrency.decimal_digits,
          )
          let distributionIndex = 0
          newPaidFor = paidFor.map((participant) => {
            if (editedParticipants.includes(participant.participant)) {
              return participant
            }
            return {
              ...participant,
              shares: distributed[distributionIndex++] ?? 0,
            }
          })
        } else {
          newPaidFor = paidFor
        }
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

  const handleOriginalCurrencyChange = useCallback(
    (currencyCode: string) => {
      const groupCode = group.currencyCode ?? ''
      const previousCurrency = form.getValues('originalCurrency') ?? ''
      const wasForeign =
        !!groupCode.length &&
        !!previousCurrency.length &&
        previousCurrency !== groupCode
      const willBeForeign =
        !!groupCode.length &&
        !!currencyCode.length &&
        currencyCode !== groupCode

      form.setValue('originalCurrency', currencyCode, { shouldDirty: true })

      if (!wasForeign && willBeForeign) {
        const amount = Number(form.getValues('amount')) || 0
        if (amount !== 0) {
          form.setValue('originalAmount', amount, {
            shouldDirty: true,
            shouldTouch: true,
          })
          pendingAmountConversionRef.current = true
        }
      }

      if (wasForeign && !willBeForeign) {
        pendingAmountConversionRef.current = false
        const convertedAmount = Number(form.getValues('amount')) || 0
        form.setValue('amount', convertedAmount, { shouldValidate: true })
        form.setValue('originalAmount', undefined)
        form.setValue('conversionRate', undefined)
      }

      if (wasForeign && willBeForeign) {
        pendingAmountConversionRef.current = true
      }
    },
    [form, group.currencyCode],
  )

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

  useEffect(() => {
    if (!conversionRequired) return

    const conversionRateValue = form.getValues('conversionRate')
    if (conversionRateValue == null) return

    const originalAmountNumber = Number(form.getValues('originalAmount') ?? 0)
    const rate = Number(conversionRateValue)
    if (!rate || Number.isNaN(rate)) return

    const convertedAmount = originalAmountNumber * rate
    if (Number.isNaN(convertedAmount)) return

    const v = enforceCurrencyPattern(
      convertedAmount.toFixed(groupCurrency.decimal_digits),
    )
    const income = Number(v) < 0
    setIsIncome(income)
    if (income) form.setValue('isReimbursement', false)
    form.setValue('amount', Number(v), { shouldValidate: true })
    pendingAmountConversionRef.current = false
  }, [
    form,
    conversionRequired,
    originalAmount,
    conversionRate,
    groupCurrency.decimal_digits,
  ])

  const formFooter = (
    <DialogFooter className="flex shrink-0 flex-col-reverse gap-2 border-t bg-popover px-0 pt-4 pb-0 sm:flex-row sm:justify-end">
      <SubmitButton
        form="expense-form"
        loadingContent={t(isCreate ? 'creating' : 'saving')}
      >
        <Save className="w-4 h-4 mr-2" />
        {t(isCreate ? 'create' : 'save')}
      </SubmitButton>
      {!isCreate && onDelete && (
        <DeletePopup onDelete={() => onDelete(participantId)}></DeletePopup>
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col @container">
        <form
          id="expense-form"
          onSubmit={form.handleSubmit(submit)}
          className={cn(
            'min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-contain scrollbar-none',
            '[&_[data-slot=button]:focus-visible]:ring-inset [&_[data-slot=checkbox]:focus-visible]:ring-inset [&_[data-slot=input]:focus-visible]:ring-inset [&_[data-slot=input-group]:has([data-slot=input-group-control]:focus-visible)]:ring-inset',
          )}
        >
          <div className="min-w-0 py-2">
            {scrollHeader}
            <div className={cn('space-y-4', scrollHeader && 'border-t pt-4')}>
              <ExpenseFormSection>
                <ExpenseFormSectionContent className={fieldsGridClass}>
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="">
                        <FormLabel>
                          {t(`${sExpense}.TitleField.label`)}
                        </FormLabel>
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
                            placeholder={t(
                              `${sExpense}.TitleField.placeholder`,
                            )}
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
                        <FormLabel>
                          {t(`${sExpense}.DateField.label`)}
                        </FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
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
                        <FormLabel>
                          {t(`${sExpense}.paidByField.label`)}
                        </FormLabel>
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
                              placeholder={t(
                                `${sExpense}.paidByField.placeholder`,
                              )}
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
                          <FormLabel>
                            {t('originalAmountField.label')}
                          </FormLabel>
                          <FormControl>
                            <InputGroup>
                              <InputGroupAddon align="inline-start">
                                <InputGroupText className="font-medium text-foreground tabular-nums">
                                  {getCurrencyDisplaySymbol(originalCurrency)}
                                </InputGroupText>
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
                              <InputGroupAddon align="inline-end">
                                <CurrencySelector
                                  variant="inline"
                                  currencies={defaultCurrencyList(locale, '')}
                                  defaultValue={watchedOriginalCurrency}
                                  isLoading={false}
                                  onValueChange={handleOriginalCurrencyChange}
                                />
                              </InputGroupAddon>
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
                                <InputGroupText className="font-medium text-foreground tabular-nums">
                                  {getCurrencyDisplaySymbol(originalCurrency)}
                                </InputGroupText>
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
                              {group.currencyCode ? (
                                <InputGroupAddon align="inline-end">
                                  <CurrencySelector
                                    variant="inline"
                                    currencies={defaultCurrencyList(locale, '')}
                                    defaultValue={watchedOriginalCurrency}
                                    isLoading={false}
                                    onValueChange={handleOriginalCurrencyChange}
                                  />
                                </InputGroupAddon>
                              ) : (
                                <InputGroupAddon align="inline-end">
                                  <InputGroupText>
                                    <CurrencyFlagName
                                      currency={originalCurrency}
                                    />
                                  </InputGroupText>
                                </InputGroupAddon>
                              )}
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
                                <InputGroupText className="font-medium text-foreground tabular-nums">
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
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>
                                  <CurrencyFlagName currency={groupCurrency} />
                                </InputGroupText>
                              </InputGroupAddon>
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
                            form.setValue(
                              'recurrenceRule',
                              value as RecurrenceRule,
                            )
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
                      className={cn(
                        group.id === 'direct' &&
                          !isMobileLayout &&
                          'col-start-2',
                      )}
                    />
                  )}
                </ExpenseFormSectionContent>
              </ExpenseFormSection>

              <ExpenseFormSection>
                <ExpenseFormSectionHeader>
                  <ExpenseFormSectionTitle className="flex justify-between">
                    <span>{t(`${sExpense}.paidFor.title`)}</span>
                    <Button
                      variant="link"
                      type="button"
                      className="-my-2 focus-visible:ring-inset"
                      onClick={() => {
                        const currentPaidFor = form.getValues().paidFor
                        const newPaidFor = allParticipantsSelected
                          ? []
                          : group.participants.map((p) => ({
                              participant: p.id,
                              shares:
                                currentPaidFor.find(
                                  (pfor) => pfor.participant === p.id,
                                )?.shares ?? 1,
                            }))
                        const paidForToSet = (() => {
                          if (allParticipantsSelected) return newPaidFor
                          const currentSplitMode = form.getValues('splitMode')
                          if (currentSplitMode === 'BY_PERCENTAGE') {
                            return withEqualPercentageSplit(newPaidFor)
                          }
                          if (currentSplitMode === 'BY_AMOUNT') {
                            return withEqualAmountSplit(
                              newPaidFor,
                              Number(form.getValues('amount')) || 0,
                              groupCurrency.decimal_digits,
                            )
                          }
                          return newPaidFor
                        })()

                        if (
                          !allParticipantsSelected &&
                          (form.getValues('splitMode') === 'BY_PERCENTAGE' ||
                            form.getValues('splitMode') === 'BY_AMOUNT')
                        ) {
                          setManuallyEditedParticipants(new Set())
                        }

                        form.setValue('paidFor', paidForToSet, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }}
                    >
                      {allParticipantsSelected ? (
                        <>{t('selectNone')}</>
                      ) : (
                        <>{t('selectAll')}</>
                      )}
                    </Button>
                  </ExpenseFormSectionTitle>
                  <ExpenseFormSectionDescription>
                    {t(`${sExpense}.paidFor.description`)}
                  </ExpenseFormSectionDescription>
                </ExpenseFormSectionHeader>
                <ExpenseFormSectionContent>
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
                                  className={participantRowClass}
                                >
                                  <FormItem
                                    className={participantFormItemClass}
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.some(
                                          ({ participant }) =>
                                            participant === id,
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
                                                (value) =>
                                                  value.participant !== id,
                                              )

                                          if (
                                            form.getValues('splitMode') ===
                                            'BY_PERCENTAGE'
                                          ) {
                                            newPaidFor =
                                              withEqualPercentageSplit(
                                                newPaidFor ?? [],
                                              )
                                            setManuallyEditedParticipants(
                                              new Set(),
                                            )
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
                                                  ({
                                                    participant,
                                                    shares,
                                                  }) => ({
                                                    user: {
                                                      id: participant,
                                                      name: '',
                                                    },
                                                    shares:
                                                      form.watch(
                                                        'splitMode',
                                                      ) === 'BY_PERCENTAGE'
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
                                    </FormLabel>
                                  </FormItem>
                                  <div className={participantSharesClass}>
                                    {form.getValues().splitMode ===
                                      'BY_AMOUNT' &&
                                      !!conversionRequired && (
                                        <FormField
                                          name={`paidFor[${field.value.findIndex(
                                            ({ participant }) =>
                                              participant === id,
                                          )}].originalAmount`}
                                          render={() => {
                                            const isParticipantSelected =
                                              field.value?.some(
                                                ({ participant }) =>
                                                  participant === id,
                                              )

                                            return (
                                              <div>
                                                <div
                                                  className={shareInputRowClass}
                                                >
                                                  <FormControl>
                                                    <InputGroup
                                                      className={
                                                        shareInputGroupClass
                                                      }
                                                    >
                                                      <InputGroupAddon align="inline-start">
                                                        <InputGroupText
                                                          className={cn(
                                                            'font-medium text-foreground tabular-nums',
                                                            !isParticipantSelected &&
                                                              'text-muted-foreground',
                                                          )}
                                                        >
                                                          {getCurrencyDisplaySymbol(
                                                            originalCurrency,
                                                          )}
                                                        </InputGroupText>
                                                      </InputGroupAddon>
                                                      <CurrencyAmountInput
                                                        key={String(
                                                          !isParticipantSelected,
                                                        )}
                                                        disabled={
                                                          !isParticipantSelected
                                                        }
                                                        currency={
                                                          originalCurrency
                                                        }
                                                        locale={locale}
                                                        value={
                                                          field.value.find(
                                                            ({ participant }) =>
                                                              participant ===
                                                              id,
                                                          )?.originalAmount ??
                                                          ''
                                                        }
                                                        onValueChange={(
                                                          nextValue,
                                                        ) => {
                                                          const originalAmount =
                                                            Number(nextValue)
                                                          let convertedAmount =
                                                            ''
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
                                                            field.value.map(
                                                              (p) =>
                                                                p.participant ===
                                                                id
                                                                  ? {
                                                                      participant:
                                                                        id,
                                                                      originalAmount:
                                                                        nextValue,
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
                                                              new Set(prev).add(
                                                                id,
                                                              ),
                                                          )
                                                        }}
                                                      />
                                                    </InputGroup>
                                                  </FormControl>
                                                  <ChevronRight className="mx-1 h-4 w-4 shrink-0 opacity-50" />
                                                </div>
                                              </div>
                                            )
                                          }}
                                        />
                                      )}
                                    {form.getValues().splitMode !==
                                      'EVENLY' && (
                                      <FormField
                                        name={`paidFor[${field.value.findIndex(
                                          ({ participant }) =>
                                            participant === id,
                                        )}].shares`}
                                        render={() => {
                                          const splitMode =
                                            form.getValues().splitMode
                                          const isParticipantSelected =
                                            field.value?.some(
                                              ({ participant }) =>
                                                participant === id,
                                            )

                                          return (
                                            <div>
                                              <FormControl>
                                                <ParticipantShareInput
                                                  key={String(
                                                    !isParticipantSelected,
                                                  )}
                                                  className={cn(
                                                    shareInputGroupClass,
                                                    splitMode === 'BY_SHARES' &&
                                                      'w-[6.5rem]',
                                                  )}
                                                  disabled={
                                                    !isParticipantSelected
                                                  }
                                                  splitMode={splitMode}
                                                  groupCurrency={groupCurrency}
                                                  locale={locale}
                                                  sharesLabel={t('shares')}
                                                  value={String(
                                                    field.value?.find(
                                                      ({ participant }) =>
                                                        participant === id,
                                                    )?.shares ?? '',
                                                  )}
                                                  onValueChange={(
                                                    nextValue,
                                                  ) => {
                                                    const editedParticipantIds =
                                                      new Set(
                                                        manuallyEditedParticipants,
                                                      )
                                                    editedParticipantIds.add(id)

                                                    if (
                                                      splitMode ===
                                                      'BY_PERCENTAGE'
                                                    ) {
                                                      const percentage =
                                                        Number(nextValue)
                                                      let newPaidFor =
                                                        field.value.map((p) =>
                                                          p.participant === id
                                                            ? {
                                                                participant: id,
                                                                shares:
                                                                  percentage,
                                                              }
                                                            : p,
                                                        )

                                                      if (
                                                        !Number.isNaN(
                                                          percentage,
                                                        )
                                                      ) {
                                                        newPaidFor =
                                                          balancePaidForPercentages(
                                                            newPaidFor,
                                                            editedParticipantIds,
                                                          )
                                                      }

                                                      field.onChange(newPaidFor)
                                                      setManuallyEditedParticipants(
                                                        editedParticipantIds,
                                                      )
                                                      return
                                                    }

                                                    const shareValue =
                                                      splitMode === 'BY_AMOUNT'
                                                        ? enforceCurrencyPattern(
                                                            nextValue,
                                                          )
                                                        : nextValue
                                                    field.onChange(
                                                      field.value.map((p) =>
                                                        p.participant === id
                                                          ? {
                                                              participant: id,
                                                              shares:
                                                                shareValue,
                                                            }
                                                          : p,
                                                      ),
                                                    )
                                                    setManuallyEditedParticipants(
                                                      editedParticipantIds,
                                                    )
                                                  }}
                                                />
                                              </FormControl>
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
                                !group.participants.some(
                                  (p) => p.id === pf.userId,
                                ),
                            )
                            .map((pf) => (
                              <FormField
                                key={pf.userId}
                                control={form.control}
                                name="paidFor"
                                render={({ field }) => (
                                  <div className={participantRowClass}>
                                    <FormItem
                                      className={participantFormItemClass}
                                    >
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
                                                    Number(
                                                      form.watch('amount'),
                                                    ),
                                                    groupCurrency,
                                                  ),
                                                  paidFor: field.value.map(
                                                    ({
                                                      participant,
                                                      shares,
                                                    }) => ({
                                                      user: {
                                                        id: participant,
                                                        name: '',
                                                      },
                                                      shares:
                                                        form.watch(
                                                          'splitMode',
                                                        ) === 'BY_PERCENTAGE'
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
                                                    form.watch(
                                                      'isReimbursement',
                                                    ),
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

              <ExpenseFormSection>
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
                        <FormItem className="w-full">
                          <FormControl>
                            <Textarea className="text-base w-full" {...field} />
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
                    <div className={collapsibleFieldsGridClass}>
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
                                    const paidFor =
                                      form.getValues('paidFor') ?? []
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

                                  if (splitMode === 'BY_AMOUNT') {
                                    const paidFor =
                                      form.getValues('paidFor') ?? []
                                    form.setValue(
                                      'paidFor',
                                      withEqualAmountSplit(
                                        paidFor,
                                        Number(form.getValues('amount')) || 0,
                                        groupCurrency.decimal_digits,
                                      ),
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
                          <FormItem
                            className={cn(
                              'flex flex-row items-start gap-2 space-y-0',
                              isMobileLayout ? 'self-start' : 'self-center',
                            )}
                          >
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
                      description={
                        <>
                          {t(`${sExpense}.attachDescription`)}
                          <br />
                          {tDocuments('addDocumentHint')}
                        </>
                      }
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
          </div>
        </form>
        {formFooter}
      </div>
    </Form>
  )
}
