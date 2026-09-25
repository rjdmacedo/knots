import { ExpenseConversionRateField } from '@/app/groups/[groupId]/expenses/expense-conversion-rate-field'
import {
  ExpenseFormCardCollapsible,
  ExpenseFormCollapsible,
} from '@/app/groups/[groupId]/expenses/expense-form-collapsible'
import { ItemizedExpenseEditor } from '@/app/groups/[groupId]/expenses/itemized-expense-editor'
import { CategorySelector } from '@/components/category-selector'
import { CurrencyAmountInput } from '@/components/currency-amount-input'
import {
  CurrencyFlagName,
  CurrencySelector,
} from '@/components/currency-selector'
import { DatePicker } from '@/components/date-picker'
import { DecompositionBanner } from '@/components/decomposition-banner'
import { DeletePopup } from '@/components/delete-popup'
import { DuplicateExpenseDialog } from '@/components/duplicate-expense-dialog'
import { ExpenseDocumentsInput } from '@/components/expense-documents-input'
import { extractCategoryFromTitle } from '@/components/expense-form-actions'
import {
  ExpenseTitleInput,
  ExpenseTitleSuggestion,
} from '@/components/expense-title-input'
import { useDuplicateCheck } from '@/components/hooks/use-duplicate-check'
import { useFormPersistence } from '@/components/hooks/use-form-persistence'
import { PayerSelector, type PayerEntry } from '@/components/payer-selector'
import { PreventNavigation } from '@/components/prevent-navigation'
import {
  SplitModeSelector,
  type SplitModeValue,
} from '@/components/split-mode-selector'
import { SubmitButton } from '@/components/submit-button'
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
import { Card, CardContent } from '@/components/ui/card'
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
import { toast } from '@/components/ui/toast'
import { Locale } from '@/i18n'
import { randomId } from '@/lib/api'
import { defaultCurrencyList, getCurrency, type Currency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  getCurrencyDisplaySymbol,
} from '@/lib/currency-input'
import { computeDecompositionSlots } from '@/lib/decompose-expense'
import { distributeEqualAmounts } from '@/lib/distribute-amount'
import type { DuplicateCheckResult } from '@/lib/duplicate-expense-detection'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useCurrencyRate, useGroupParticipantId } from '@/lib/hooks'
import {
  emptyDocumentationItemization,
  leaveAuthoritative,
  switchToAuthoritative,
} from '@/lib/itemization-gate'
import {
  ExpenseFormValues,
  PaidByOptions,
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
import { Check, ChevronRight, Minus, Plus, Save } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
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
}: {
  disabled: boolean
  value: string
  onValueChange: (value: string) => void
  className?: string
  splitMode: ExpenseFormValues['splitMode']
  groupCurrency: Currency
  locale: Locale
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
    </InputGroup>
  )
}

function ShareStepper({
  disabled,
  value,
  onValueChange,
  decreaseLabel,
  increaseLabel,
}: {
  disabled: boolean
  value: string
  onValueChange: (value: string) => void
  decreaseLabel: string
  increaseLabel: string
}) {
  const current = Number(value)
  const count = Number.isFinite(current) ? current : 0
  const step = (delta: number) => {
    onValueChange(String(Math.max(0, count + delta)))
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        disabled={disabled || count <= 0}
        aria-label={decreaseLabel}
        onClick={() => step(-1)}
      >
        <Minus />
      </Button>
      <span className="w-6 text-center text-sm font-medium tabular-nums">
        {count}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        disabled={disabled}
        aria-label={increaseLabel}
        onClick={() => step(1)}
      >
        <Plus />
      </Button>
    </div>
  )
}

function SplitAllocationSummary({
  splitMode,
  paidFor,
  amount,
  currency,
  locale,
  evenlyLabel,
  totalWeightLabel,
  matchesPercentLabel,
  matchesAmountLabel,
}: {
  splitMode: ExpenseFormValues['splitMode']
  paidFor: ExpenseFormValues['paidFor']
  amount: number
  currency: Currency
  locale: Locale
  evenlyLabel: (amount: string, count: number) => string
  totalWeightLabel: (count: number) => string
  matchesPercentLabel: string
  matchesAmountLabel: (amount: string) => string
}) {
  const selected = paidFor ?? []
  const count = selected.length
  let text = ''
  let matches = false

  if (splitMode === 'EVENLY') {
    if (count === 0) return null
    const each = amount / count
    text = evenlyLabel(
      formatCurrency(currency, amountAsMinorUnits(each, currency), locale),
      count,
    )
  } else if (splitMode === 'BY_SHARES') {
    const weight = selected.reduce(
      (sum, entry) => sum + (Number(entry.shares) || 0),
      0,
    )
    text = totalWeightLabel(weight)
  } else if (splitMode === 'BY_PERCENTAGE') {
    const total = selected.reduce(
      (sum, entry) => sum + (Number(entry.shares) || 0),
      0,
    )
    matches = Math.abs(total - 100) < 0.05
    text = matchesPercentLabel
  } else {
    const totalMinor = selected.reduce(
      (sum, entry) =>
        sum + amountAsMinorUnits(Number(entry.shares) || 0, currency),
      0,
    )
    const targetMinor = amountAsMinorUnits(amount, currency)
    matches = Math.abs(totalMinor - targetMinor) <= 1
    text = matchesAmountLabel(formatCurrency(currency, targetMinor, locale))
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground md:text-sm">
      {matches ? <Check className="size-4 text-primary" /> : null}
      {text}
    </p>
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
 * Rebuild the form's `itemization` value from a persisted expense for edit mode.
 * Items, tax and tip are stored in Entry_Currency minor units; convert them back
 * to major units so the editor shows exactly what the user typed. Returns
 * undefined (itemized off) when the expense has no items.
 */
function buildItemizationDefault(
  expense: NonNullable<AppRouterOutput['groups']['expenses']['get']['expense']>,
  entryCurrency: Currency,
): ExpenseFormValues['itemization'] {
  const items = expense.items ?? []
  if (items.length === 0) return undefined
  const allocationMode =
    expense.remainderAllocationMode === 'CUSTOM' ? 'CUSTOM' : 'PROPORTIONAL'
  return {
    authoritative: expense.itemsAuthoritative,
    items: items.map((item) => ({
      title: item.title,
      unitPrice: amountAsDecimal(item.unitPrice || item.amount, entryCurrency),
      quantity: item.quantity || 1,
      amount: amountAsDecimal(item.amount, entryCurrency),
      assignedParticipants: item.assignments.map((a) => a.userId),
    })),
    remainder: {
      amount: amountAsDecimal(expense.remainderAmount ?? 0, entryCurrency),
      allocationMode,
      splitMode: expense.remainderSplitMode ?? undefined,
      paidFor:
        allocationMode === 'CUSTOM'
          ? expense.remainderShares.map((s) => ({
              participant: s.userId,
              shares: s.shares,
            }))
          : undefined,
    },
  }
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

function getStoredPaidByParticipantIds(
  group: NonNullable<AppRouterOutput['groups']['get']['group']>,
): string[] | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(`${group.id}-defaultPaidByOptions`)
  if (raw === null) return null

  try {
    const parsed = JSON.parse(raw) as PaidByOptions
    if (!Array.isArray(parsed.payers) || parsed.payers.length === 0) {
      return null
    }

    const validPayers = parsed.payers.filter((participantId) =>
      group.participants.some(({ id }) => id === participantId),
    )

    if (validPayers.length !== parsed.payers.length) {
      localStorage.removeItem(`${group.id}-defaultPaidByOptions`)
      return null
    }

    return validPayers
  } catch {
    localStorage.removeItem(`${group.id}-defaultPaidByOptions`)
    return null
  }
}

async function persistDefaultPaidByOptions(
  groupId: string,
  expenseFormValues: ExpenseFormValues,
): Promise<void> {
  if (!localStorage || !expenseFormValues.saveDefaultPaidByOptions) return

  const payers = expenseFormValues.paidBy
    .map(({ participant }) => participant)
    .filter(Boolean)

  if (payers.length === 0) return

  const paidByOptions = { payers } satisfies PaidByOptions
  localStorage.setItem(
    `${groupId}-defaultPaidByOptions`,
    JSON.stringify(paidByOptions),
  )
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
  return <div className={cn('min-w-0 space-y-4', className)}>{children}</div>
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
  paidBy?: string | Array<{ participant: string; amount: number }>
  paidFor?: ExpenseFormValues['paidFor']
  splitMode?: ExpenseFormValues['splitMode']
  notes?: string
  // Optional itemized prefill (e.g. from a receipt scan). Items are suggested,
  // unassigned, and editable; amounts are in major units of the entry currency.
  items?: Array<{ title: string; amount: number }>
}

/**
 * Component for managing the creation and editing of an expense form.
 *
 * @param props - The properties for the ExpenseForm component.
 * @param props.group - Details of the group to which the expense belongs.
 * @param props.expense - Existing expense data, if editing an expense.
 * @param props.onSubmit - Function to handle form submission, receives form values and an optional participant ID.
 * @param props.onDelete - Function to handle deletion of an expense, receives an optional participant ID.
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
  categories,
  createPrefill,
  currentUserId,
  preferredCurrency,
  runtimeFeatureFlags,
  isDesktop = false,
  scrollHeader,
  singlePayerOnly = false,
  containedScroll = true,
}: {
  group: NonNullable<AppRouterOutput['groups']['get']['group']>
  expense?: AppRouterOutput['groups']['expenses']['get']['expense']
  onSubmit: (value: ExpenseFormValues, participantId?: string) => Promise<void>
  onDelete?: (participantId?: string) => Promise<void>
  categories: AppRouterOutput['categories']['list']['categories']
  createPrefill?: ExpenseFormCreatePrefill
  currentUserId?: string
  preferredCurrency?: string | null
  runtimeFeatureFlags: RuntimeFeatureFlags
  isDesktop?: boolean
  scrollHeader?: ReactNode
  singlePayerOnly?: boolean
  /** When false, the page scroller moves the form. The dialog keeps its own scroll. */
  containedScroll?: boolean
}) {
  const t = useTranslations('ExpenseForm')
  const tDocuments = useTranslations('ExpenseDocumentsInput')
  const tDuplicate = useTranslations('DuplicateExpense')
  const locale = useLocale() as Locale
  const router = useRouter()
  const isCreate = expense === undefined
  const searchParams = useSearchParams()
  const isMobileLayout = !isDesktop
  const fieldsGridClass = isMobileLayout
    ? 'grid min-w-0 grid-cols-1 items-start gap-4'
    : 'grid min-w-0 grid-cols-2 items-start gap-4 sm:gap-6'
  const participantRowClass =
    'flex min-w-0 items-center justify-between gap-3 border-t py-2'
  const participantFormItemClass =
    'flex min-w-0 flex-1 flex-row items-center space-x-3 space-y-0'
  const participantSharesClass = 'flex shrink-0 items-center justify-end gap-1'
  const shareInputRowClass = 'flex items-center gap-1'
  const shareInputGroupClass = 'h-8 w-[5.25rem] shrink-0'
  const collapsibleFieldsGridClass =
    'grid w-full min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2 sm:gap-6'

  const getSelectedRecurrenceRule = (field?: { value: string }) => {
    return field?.value as RecurrenceRule
  }
  const defaultSplittingOptions = getDefaultSplittingOptions(group)
  const groupCurrency = getCurrencyFromGroup(group)

  const getDefaultPaidBy = (): ExpenseFormValues['paidBy'] | undefined => {
    if (!isCreate) return undefined

    const initialAmount = Number(searchParams.get('amount')) || 0
    const storedPayers = getStoredPaidByParticipantIds(group)

    if (storedPayers && storedPayers.length > 0) {
      if (storedPayers.length === 1) {
        return [{ participant: storedPayers[0], amount: initialAmount }]
      }
      const amounts = distributeEqualAmounts(
        initialAmount,
        storedPayers.length,
        groupCurrency.decimal_digits,
      )
      return storedPayers.map((participant, index) => ({
        participant,
        amount: amounts[index] ?? 0,
      }))
    }

    if (
      currentUserId &&
      group.participants.some(({ id }) => id === currentUserId)
    ) {
      return [{ participant: currentUserId, amount: initialAmount }]
    }

    return undefined
  }

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
          originalAmount:
            expense.originalAmount != null && expense.originalCurrency
              ? amountAsDecimal(
                  expense.originalAmount,
                  getCurrency(expense.originalCurrency, locale),
                )
              : undefined,
          conversionRate: expense.conversionRate?.toNumber(),
          category: expense.categoryId,
          paidBy:
            expense.payers && expense.payers.length > 0
              ? expense.payers.map((p) => ({
                  participant: p.userId,
                  amount: amountAsDecimal(p.amount, groupCurrency),
                }))
              : [
                  {
                    participant: expense.paidById,
                    amount: amountAsDecimal(expense.amount, groupCurrency),
                  },
                ],
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
          saveDefaultPaidByOptions: false,
          isReimbursement: expense.isReimbursement,
          documents: expense.documents,
          notes: expense.notes ?? '',
          recurrenceRule: expense.recurrenceRule ?? undefined,
          itemization: buildItemizationDefault(
            expense,
            expense.originalCurrency
              ? getCurrency(expense.originalCurrency, locale)
              : groupCurrency,
          ),
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
            paidBy: searchParams.get('from')
              ? [
                  {
                    participant: searchParams.get('from')!,
                    amount: amountAsDecimal(
                      Number(searchParams.get('amount')) || 0,
                      groupCurrency,
                    ),
                  },
                ]
              : getDefaultPaidBy(),
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
            saveDefaultPaidByOptions: false,
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
              paidBy: createPrefill.paidBy
                ? Array.isArray(createPrefill.paidBy)
                  ? createPrefill.paidBy
                  : [
                      {
                        participant: createPrefill.paidBy,
                        amount: createPrefill.amount ?? 0,
                      },
                    ]
                : getDefaultPaidBy(),
              paidFor: createPrefill.paidFor ?? defaultSplittingOptions.paidFor,
              isReimbursement: createPrefill.isReimbursement ?? false,
              splitMode:
                createPrefill.splitMode ?? defaultSplittingOptions.splitMode,
              saveDefaultSplittingOptions: false,
              saveDefaultPaidByOptions: false,
              documents: createPrefill.documents ?? [],
              notes: createPrefill.notes ?? '',
              recurrenceRule: RecurrenceRule.NONE,
              // Receipt-suggested items land as Documentation_Items
              // (authoritative = false): they do not drive the split until the
              // user confirms "Use items as split" (Requirement 9.6, 12.2). No
              // auto-assignment (Requirement 9.5).
              itemization:
                createPrefill.items && createPrefill.items.length > 0
                  ? {
                      authoritative: false,
                      items: createPrefill.items.map((item) => ({
                        title: item.title,
                        unitPrice: item.amount,
                        quantity: 1,
                        amount: item.amount,
                        assignedParticipants: [],
                      })),
                      remainder: { allocationMode: 'PROPORTIONAL' as const },
                    }
                  : undefined,
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
              saveDefaultPaidByOptions: false,
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

  // Friends are resolved for decomposition-banner names. Who is on the
  // expense is chosen in the participant picker, not in the split list.
  const { data: friendsList } = trpc.friends.list.useQuery(undefined, {
    enabled: !expense || expense.creationMethod !== 'NON_MEMBER_SPLIT',
  })

  const recurrenceRuleValue = form.watch('recurrenceRule')

  const memberIdSet = new Set(group.participants.map((p) => p.id))
  const showNonMemberOptions =
    (!expense || expense.creationMethod !== 'NON_MEMBER_SPLIT') &&
    (!recurrenceRuleValue || recurrenceRuleValue === 'NONE')

  const nonMemberFriends =
    showNonMemberOptions && friendsList
      ? friendsList.filter(
          (f) => f.friendUserId !== null && !memberIdSet.has(f.friendUserId),
        )
      : []
  const uploadPendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)
  const deletePendingDocumentsRef = useRef<(() => Promise<void>) | null>(null)

  // Duplicate expense detection
  const { checkForDuplicates, isChecking } = useDuplicateCheck({
    context: { type: 'group', groupId: group.id },
  })
  const [duplicateMatches, setDuplicateMatches] = useState<
    DuplicateCheckResult['matches']
  >([])
  const [pendingSubmitData, setPendingSubmitData] =
    useState<ExpenseFormValues | null>(null)
  const { save, restore, clear } = useFormPersistence<ExpenseFormValues>({
    key: `knots:duplicate-form:group-${group.id}:${expense?.id || 'new'}`,
  })

  useEffect(() => {
    const restored = restore()
    if (!restored) return
    form.reset({
      ...restored,
      expenseDate: new Date(restored.expenseDate),
    })
    clear()
  }, [restore, clear, form])

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

    // Check for duplicates before proceeding
    const result = await checkForDuplicates({
      title: values.title,
      amount: amountAsMinorUnits(Number(values.amount), groupCurrency),
      expenseDate: values.expenseDate,
      categoryId: values.category,
      excludeExpenseId: expense?.id,
    })

    if (result.hasDuplicates) {
      // Store form values and show dialog instead of submitting
      setDuplicateMatches(result.matches)
      setPendingSubmitData(values)
      return
    }

    await proceedWithSubmit(values)
  }

  const proceedWithSubmit = async (values: ExpenseFormValues) => {
    await persistDefaultSplittingOptions(group.id, values)
    await persistDefaultPaidByOptions(group.id, values)

    // Store monetary amounts in minor units (cents)
    values.amount = amountAsMinorUnits(values.amount, groupCurrency)
    values.paidBy = values.paidBy.map(({ participant, amount }) => ({
      participant,
      amount: amountAsMinorUnits(amount, groupCurrency),
    }))
    values.paidFor = values.paidFor.map(({ participant, shares }) => ({
      participant,
      shares:
        values.splitMode === 'BY_AMOUNT'
          ? amountAsMinorUnits(shares, groupCurrency)
          : values.splitMode === 'BY_PERCENTAGE'
            ? toPercentageBasisPoints(shares)
            : values.splitMode === 'EVENLY'
              ? 1
              : shares,
    }))

    // Convert itemization item amounts and the "Other" remainder to MINOR units
    // — the single minor-unit conversion for itemized data — using the
    // Entry_Currency digits (original currency when a conversion is required,
    // group currency otherwise). Items and remainder stay in the Entry_Currency;
    // the server converts the total and re-derives group-currency shares (see
    // apply-itemized-conversion). Runs whenever items exist so documentation
    // items are stored in minor units too.
    if (values.itemization && values.itemization.items.length > 0) {
      const entryCurrency = conversionRequired
        ? originalCurrency
        : groupCurrency
      const remainder = values.itemization.remainder
      values.itemization = {
        ...values.itemization,
        items: values.itemization.items.map((item) => {
          const quantity = Math.max(1, Math.trunc(Number(item.quantity)) || 1)
          const unitPriceMinor = amountAsMinorUnits(
            Number(item.unitPrice ?? item.amount) || 0,
            entryCurrency,
          )
          return {
            ...item,
            quantity,
            unitPrice: unitPriceMinor,
            // Item_Amount = unitPrice × quantity in minor units (Requirement 14).
            amount: unitPriceMinor * quantity,
          }
        }),
        remainder: {
          ...remainder,
          amount: amountAsMinorUnits(
            Number(remainder.amount) || 0,
            entryCurrency,
          ),
          // CUSTOM BY_AMOUNT rows are entered in major units; convert them too.
          paidFor:
            remainder.allocationMode === 'CUSTOM' &&
            remainder.splitMode === 'BY_AMOUNT'
              ? (remainder.paidFor ?? []).map((row) => ({
                  ...row,
                  shares: amountAsMinorUnits(
                    Number(row.shares) || 0,
                    entryCurrency,
                  ),
                }))
              : remainder.paidFor,
        },
      }
    }

    // Currency should be blank if the same as group currency
    if (!conversionRequired) {
      delete values.originalAmount
      delete values.originalCurrency
      delete values.conversionRate
    } else {
      // Convert originalAmount to minor units using the original currency's decimal digits
      values.originalAmount = amountAsMinorUnits(
        Number(values.originalAmount),
        originalCurrency,
      )
      // Only send conversionRate when user has toggled custom rate mode (fallback signal)
      if (!usingCustomConversionRate) {
        delete values.conversionRate
      }
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

  const handleDuplicateConfirm = async () => {
    if (pendingSubmitData) {
      setDuplicateMatches([])
      const data = pendingSubmitData
      setPendingSubmitData(null)
      await proceedWithSubmit(data)
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

  const applyPaidFor = (nextPaidFor: ExpenseFormValues['paidFor']) => {
    form.setValue('paidFor', nextPaidFor, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }

  const toggleAllParticipants = () => {
    const currentPaidFor = form.getValues().paidFor
    const newPaidFor = allParticipantsSelected
      ? []
      : group.participants.map((participant) => ({
          participant: participant.id,
          shares:
            currentPaidFor.find((entry) => entry.participant === participant.id)
              ?.shares ?? 1,
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

    applyPaidFor(paidForToSet)
  }

  const resetSplitWeights = () => {
    const currentSplitMode = form.getValues('splitMode')
    const currentPaidFor = form.getValues('paidFor') ?? []
    if (currentSplitMode === 'EVENLY') {
      applyPaidFor(
        group.participants.map((participant) => ({
          participant: participant.id,
          shares: 1,
        })),
      )
      return
    }
    if (currentSplitMode === 'BY_PERCENTAGE') {
      setManuallyEditedParticipants(new Set())
      applyPaidFor(withEqualPercentageSplit(currentPaidFor))
      return
    }
    if (currentSplitMode === 'BY_AMOUNT') {
      setManuallyEditedParticipants(new Set())
      applyPaidFor(
        withEqualAmountSplit(
          currentPaidFor,
          Number(form.getValues('amount')) || 0,
          groupCurrency.decimal_digits,
        ),
      )
      return
    }
    applyPaidFor(
      currentPaidFor.map((entry) => ({
        ...entry,
        shares: 1,
      })),
    )
  }

  // Itemization gate (v1.1). Items may exist as documentation while a legacy
  // split is active; they only drive the split (authoritative) after the user
  // confirms "Switch to itemised?". Unavailable for reimbursements and recurring
  // expenses (Requirement 1.8, 12).
  const itemizationValue = form.watch('itemization')
  const itemsAuthoritative = itemizationValue?.authoritative === true
  const hasItems = (itemizationValue?.items?.length ?? 0) > 0
  const itemizedAvailable =
    !form.watch('isReimbursement') &&
    (!recurrenceRuleValue || recurrenceRuleValue === 'NONE')

  // Whether the items section (documentation or authoritative) is shown.
  const [itemsSectionOpen, setItemsSectionOpen] = useState(false)
  const showItemsSection = itemizedAvailable && (itemsSectionOpen || hasItems)

  // Paid by is independently collapsible. Items vs Split between are mutually
  // exclusive: opening one collapses the other (they are antithetical ways to
  // decide who owes what).
  const [paidByOpen, setPaidByOpen] = useState(true)
  // 'none' = both collapsed (allowed); never both expanded.
  const [itemsOrSplit, setItemsOrSplit] = useState<'items' | 'split' | 'none'>(
    () => (expense?.itemsAuthoritative ? 'items' : 'split'),
  )
  const itemsExpanded = itemizedAvailable && itemsOrSplit === 'items'
  const splitExpanded = itemsOrSplit === 'split'

  // Keep focus on Items while authoritative; opening Split asks to leave first.
  useEffect(() => {
    if (itemsAuthoritative) setItemsOrSplit('items')
  }, [itemsAuthoritative])

  // Pending "switch to itemised?" confirmation. When set, a split-affecting edit
  // is waiting for the user to confirm turning documentation items authoritative;
  // the callback applies that edit once confirmed.
  const [pendingSwitchApply, setPendingSwitchApply] = useState<
    (() => void) | null
  >(null)
  const [showLeaveItemizedDialog, setShowLeaveItemizedDialog] = useState(false)
  // After confirming leave-itemized, open the Split section.
  const [openSplitAfterLeave, setOpenSplitAfterLeave] = useState(false)

  // Item assignment follows the participant picker: the selected group's
  // members, plus any friends chosen there. Other friends stay out.
  const itemizedParticipants = group.participants.map(({ id, name }) => ({
    id,
    name: name?.trim() || id,
  }))

  // Open the items section, seeding an empty documentation itemization.
  const handleAddItemsSection = () => {
    setItemsSectionOpen(true)
    setItemsOrSplit('items')
    if (!form.getValues('itemization')) {
      form.setValue('itemization', emptyDocumentationItemization(), {
        shouldDirty: true,
      })
    }
  }

  const requestOpenItems = (open: boolean) => {
    if (!open) {
      // Collapsing Items is fine; switch focus to Split so one side stays usable.
      setItemsOrSplit('split')
      return
    }
    setItemsOrSplit('items')
  }

  const requestOpenSplit = (open: boolean) => {
    if (!open) {
      // Collapsing Split while Items exist → focus Items; otherwise both closed.
      setItemsOrSplit(showItemsSection ? 'items' : 'none')
      return
    }
    if (itemsAuthoritative) {
      setOpenSplitAfterLeave(true)
      setShowLeaveItemizedDialog(true)
      return
    }
    setItemsOrSplit('split')
  }

  // Gate: request making items authoritative. If already authoritative, run the
  // edit immediately; otherwise stash it and open the "Switch to itemised?"
  // confirmation (Requirement 12.2).
  const requestAuthoritativeEdit = (applyEdit: () => void) => {
    if (form.getValues('itemization')?.authoritative) {
      applyEdit()
      return
    }
    setPendingSwitchApply(() => applyEdit)
  }

  const confirmSwitchToItemized = () => {
    form.setValue(
      'itemization',
      switchToAuthoritative(form.getValues('itemization')),
      { shouldDirty: true },
    )
    // Apply the edit that triggered the gate, then let the editor's sync effect
    // derive the BY_AMOUNT paidFor.
    pendingSwitchApply?.()
    setPendingSwitchApply(null)
    setItemsOrSplit('items')
  }

  const cancelSwitchToItemized = () => setPendingSwitchApply(null)

  // Leave authoritative itemization: keep items as documentation (Requirement
  // 13.4), restore an even legacy split.
  const confirmLeaveItemized = () => {
    const next = leaveAuthoritative(
      form.getValues('itemization'),
      form.getValues('paidFor') ?? [],
    )
    form.setValue('itemization', next.itemization, { shouldDirty: true })
    form.setValue('splitMode', next.splitMode, { shouldDirty: true })
    form.setValue('paidFor', next.paidFor, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setShowLeaveItemizedDialog(false)
    if (openSplitAfterLeave) {
      setItemsOrSplit('split')
      setOpenSplitAfterLeave(false)
    }
  }

  useEffect(() => {
    setManuallyEditedParticipants(new Set())
  }, [splitMode, amount])

  // When isReimbursement is toggled on and there are multiple payers, collapse to single payer
  const isReimbursement = form.watch('isReimbursement')
  useEffect(() => {
    if (!isReimbursement) return
    const currentPaidBy = form.getValues('paidBy')
    if (Array.isArray(currentPaidBy) && currentPaidBy.length > 1) {
      form.setValue('paidBy', [currentPaidBy[0]], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [isReimbursement, form])

  // When at least one non-member is in paidFor, collapse paidBy to a single entry (R5.8)
  const hasNonMembersInPaidFor = (paidFor ?? []).some(
    (pf) => !memberIdSet.has(pf.participant),
  )
  useEffect(() => {
    if (!hasNonMembersInPaidFor) return
    const currentPaidBy = form.getValues('paidBy')
    if (Array.isArray(currentPaidBy) && currentPaidBy.length > 1) {
      form.setValue('paidBy', [currentPaidBy[0]], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [hasNonMembersInPaidFor, form])

  // Recurring + non-member guard (R13.1, R13.2)
  // When recurrenceRule ≠ NONE and at least one non-member is in paidFor,
  // show an inline error and block form submission.
  const hasRecurringNonMemberConflict =
    hasNonMembersInPaidFor &&
    !!recurrenceRuleValue &&
    recurrenceRuleValue !== 'NONE'

  // Decomposition banner: compute slots from live form state (R6.1, R6.4, R6.5)
  // amount, splitMode, paidFor are already watched above and update reactively.
  const bannerCurrency = getCurrency(group.currencyCode ?? group.currency)
  const bannerFactor = 10 ** bannerCurrency.decimal_digits
  const bannerTotalMinor = Math.round(Number(amount) * bannerFactor)
  const bannerPaidForMinor = (paidFor ?? []).map((pf) => ({
    ...pf,
    shares:
      splitMode === 'BY_AMOUNT'
        ? Math.round(Number(pf.shares) * bannerFactor)
        : Number(pf.shares), // EVENLY/BY_SHARES/BY_PERCENTAGE: shares are weights, pass through
  }))
  const bannerSlots = hasNonMembersInPaidFor
    ? computeDecompositionSlots(
        {
          amount: bannerTotalMinor,
          splitMode: splitMode as ExpenseFormValues['splitMode'],
          paidFor: bannerPaidForMinor,
        },
        group,
      )
    : null

  const groupHalfAmountMajor = bannerSlots
    ? bannerSlots.groupHalfAmount / bannerFactor
    : Number(amount)

  // Resolve a participant name from group members or nonMemberFriends list
  const resolveParticipantName = (userId: string): string => {
    const groupMember = group.participants.find((p) => p.id === userId)
    if (groupMember) return groupMember.name?.trim() || userId
    const friend = nonMemberFriends.find((f) => f.friendUserId === userId)
    if (friend) return friend.name
    return userId
  }

  const bannerNonMembers = bannerSlots
    ? bannerSlots.directHalfEntries
        .map((e) => ({
          userId: e.userId,
          name: resolveParticipantName(e.userId),
          amountMajor: e.amount / bannerFactor,
        }))
        .filter((e) => e.amountMajor > 0)
    : []

  // Synchronize single-payer amount with the expense total.
  // When there's only one payer, their amount must always equal the expense amount.
  const paidBy = form.watch('paidBy')
  useEffect(() => {
    if (!Array.isArray(paidBy) || paidBy.length !== 1) return
    const expenseAmount = Number(amount) || 0
    const currentPayerAmount =
      typeof paidBy[0].amount === 'string'
        ? Number(paidBy[0].amount) || 0
        : paidBy[0].amount
    if (currentPayerAmount !== expenseAmount) {
      form.setValue('paidBy', [{ ...paidBy[0], amount: expenseAmount }], {
        shouldValidate: false,
      })
    }
  }, [amount, paidBy, form])

  useEffect(() => {
    const splitMode = form.getValues().splitMode

    // Skip auto-balancing when itemization is authoritative: the
    // ItemizedExpenseEditor owns the BY_AMOUNT paidFor split and an even re-split
    // would clobber the item-derived per-participant amounts.
    if (form.getValues().itemization?.authoritative) return

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
    <DialogFooter className="flex shrink-0 flex-row justify-end gap-2 border-t bg-popover px-4 pt-4 pb-4">
      <SubmitButton
        form="expense-form"
        loadingContent={t(isCreate ? 'creating' : 'saving')}
        isLoading={isChecking}
        disabled={hasRecurringNonMemberConflict}
      >
        <Save className="w-4 h-4 mr-2" />
        {t(isCreate ? 'create' : 'save')}
      </SubmitButton>
      {!isCreate && onDelete && (
        <DeletePopup onDelete={() => onDelete(participantId)}></DeletePopup>
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
            containedScroll
              ? 'min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-contain scrollbar-none'
              : 'min-w-0',
            '[&_[data-slot=button]:focus-visible]:ring-inset [&_[data-slot=checkbox]:focus-visible]:ring-inset [&_[data-slot=input]:focus-visible]:ring-inset [&_[data-slot=input-group]:has([data-slot=input-group-control]:focus-visible)]:ring-inset',
          )}
        >
          <div className="min-w-0 py-2">
            {scrollHeader}
            <div className={cn('space-y-4', scrollHeader && 'border-t pt-4')}>
              <Card className="gap-4 py-0 shadow-none ring-0">
                <CardContent className="px-4 py-4">
                  <ExpenseFormSection>
                    <ExpenseFormSectionContent className={fieldsGridClass}>
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem className="col-span-full">
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
                                  form.setValue(
                                    'category',
                                    suggestion.categoryId,
                                  )
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
                                        form.setValue(
                                          'category',
                                          mappedCategoryId,
                                        )
                                        return
                                      }
                                    }
                                  } catch {
                                    // Silently fall through to existing behavior
                                  }

                                  // 2. Fallback to AI extraction (if enabled)
                                  if (
                                    runtimeFeatureFlags.enableCategoryExtract
                                  ) {
                                    setCategoryLoading(true)
                                    const { categoryId } =
                                      await extractCategoryFromTitle(
                                        field.value,
                                      )
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
                                  label: t(
                                    `${sExpense}.recurrenceRule.monthly`,
                                  ),
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
                            {hasRecurringNonMemberConflict && (
                              <p className="text-sm font-medium text-destructive">
                                {t(
                                  'decompositionBanner.recurringNonMemberError',
                                )}
                              </p>
                            )}
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
                                      {getCurrencyDisplaySymbol(
                                        originalCurrency,
                                      )}
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
                                      currencies={defaultCurrencyList(
                                        locale,
                                        '',
                                      )}
                                      defaultValue={watchedOriginalCurrency}
                                      isLoading={false}
                                      onValueChange={
                                        handleOriginalCurrencyChange
                                      }
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
                                      {getCurrencyDisplaySymbol(
                                        originalCurrency,
                                      )}
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
                                        currencies={defaultCurrencyList(
                                          locale,
                                          '',
                                        )}
                                        defaultValue={watchedOriginalCurrency}
                                        isLoading={false}
                                        onValueChange={
                                          handleOriginalCurrencyChange
                                        }
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
                                      <CurrencyFlagName
                                        currency={groupCurrency}
                                      />
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

                      {conversionRequired && (
                        <ExpenseConversionRateField
                          control={form.control}
                          originalCurrency={originalCurrency}
                          groupCurrency={groupCurrency}
                          exchangeRate={exchangeRate.data}
                          usingCustomRate={usingCustomConversionRate}
                          onUsingCustomRateChange={
                            handleCustomConversionRateChange
                          }
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
                </CardContent>
              </Card>

              <ExpenseFormCardCollapsible
                title={t(`${sExpense}.paidFor.title`)}
                description={
                  itemsAuthoritative
                    ? t('itemized.authoritativeNote')
                    : t(`${sExpense}.paidFor.description`)
                }
                open={splitExpanded}
                onOpenChange={requestOpenSplit}
                disabled={itemsAuthoritative}
                headerAction={
                  itemsAuthoritative ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setOpenSplitAfterLeave(true)
                        setShowLeaveItemizedDialog(true)
                      }}
                    >
                      {t('itemized.leaveAction')}
                    </Button>
                  ) : undefined
                }
              >
                <FormField
                  control={form.control}
                  name="splitMode"
                  render={({ field: splitModeField }) =>
                    itemsAuthoritative ? (
                      <></>
                    ) : (
                      <FormItem className="space-y-3">
                        <SplitModeSelector
                          value={splitModeField.value as SplitModeValue}
                          onChange={(splitMode) => {
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

                            if (splitMode === 'BY_SHARES') {
                              const paidFor = form.getValues('paidFor') ?? []
                              form.setValue(
                                'paidFor',
                                paidFor.map((entry) => ({
                                  ...entry,
                                  shares: 1,
                                })),
                                {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                },
                              )
                            }

                            if (splitMode === 'BY_AMOUNT') {
                              const paidFor = form.getValues('paidFor') ?? []
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
                        >
                          <FormField
                            control={form.control}
                            name="paidFor"
                            render={() => (
                              <FormItem className="space-y-0">
                                <div className="mb-1 flex items-center justify-end gap-3">
                                  <Button
                                    variant="link"
                                    type="button"
                                    className="h-auto p-0"
                                    onClick={resetSplitWeights}
                                  >
                                    {t('resetSplit')}
                                  </Button>
                                  <Button
                                    variant="link"
                                    type="button"
                                    className="h-auto p-0"
                                    onClick={toggleAllParticipants}
                                  >
                                    {allParticipantsSelected
                                      ? t('selectNone')
                                      : t('selectAll')}
                                  </Button>
                                </div>
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
                                                          value.participant !==
                                                          id,
                                                      )

                                                  if (
                                                    form.getValues(
                                                      'splitMode',
                                                    ) === 'BY_PERCENTAGE'
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
                                            <FormLabel className="flex min-w-0 flex-1 flex-col items-start gap-0 text-sm font-normal">
                                              <span className="w-full min-w-0 truncate">
                                                {name}
                                              </span>
                                              {field.value?.some(
                                                ({ participant }) =>
                                                  participant === id,
                                              ) &&
                                                !form.watch(
                                                  'isReimbursement',
                                                ) && (
                                                  <span className="text-muted-foreground">
                                                    (
                                                    {formatCurrency(
                                                      groupCurrency,
                                                      calculateShare(id, {
                                                        amount:
                                                          amountAsMinorUnits(
                                                            Number(
                                                              form.watch(
                                                                'amount',
                                                              ),
                                                            ),
                                                            groupCurrency,
                                                          ), // Convert to cents
                                                        paidFor:
                                                          field.value.map(
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
                                                                ) ===
                                                                'BY_PERCENTAGE'
                                                                  ? Number(
                                                                      shares,
                                                                    ) * 100 // Convert percentage to basis points (e.g. 50% -> 5000)
                                                                  : form.watch(
                                                                        'splitMode',
                                                                      ) ===
                                                                      'BY_AMOUNT'
                                                                    ? amountAsMinorUnits(
                                                                        shares,
                                                                        groupCurrency,
                                                                      )
                                                                    : shares,
                                                            }),
                                                          ),
                                                        splitMode:
                                                          form.watch(
                                                            'splitMode',
                                                          ),
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
                                            </FormLabel>
                                          </FormItem>
                                          <div
                                            className={participantSharesClass}
                                          >
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
                                                          className={
                                                            shareInputRowClass
                                                          }
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
                                                                    ({
                                                                      participant,
                                                                    }) =>
                                                                      participant ===
                                                                      id,
                                                                  )
                                                                    ?.originalAmount ??
                                                                  ''
                                                                }
                                                                onValueChange={(
                                                                  nextValue,
                                                                ) => {
                                                                  const originalAmount =
                                                                    Number(
                                                                      nextValue,
                                                                    )
                                                                  let convertedAmount =
                                                                    ''
                                                                  if (
                                                                    !Number.isNaN(
                                                                      originalAmount,
                                                                    ) &&
                                                                    exchangeRate.data
                                                                  ) {
                                                                    convertedAmount =
                                                                      (
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
                                                                      new Set(
                                                                        prev,
                                                                      ).add(id),
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
                                            {form.getValues().splitMode ===
                                              'BY_SHARES' && (
                                              <ShareStepper
                                                disabled={
                                                  !field.value?.some(
                                                    ({ participant }) =>
                                                      participant === id,
                                                  )
                                                }
                                                decreaseLabel={t(
                                                  'decreaseShares',
                                                )}
                                                increaseLabel={t(
                                                  'increaseShares',
                                                )}
                                                value={String(
                                                  field.value?.find(
                                                    ({ participant }) =>
                                                      participant === id,
                                                  )?.shares ?? 0,
                                                )}
                                                onValueChange={(nextValue) => {
                                                  field.onChange(
                                                    field.value.map((entry) =>
                                                      entry.participant === id
                                                        ? {
                                                            participant: id,
                                                            shares: nextValue,
                                                          }
                                                        : entry,
                                                    ),
                                                  )
                                                }}
                                              />
                                            )}
                                            {form.getValues().splitMode !==
                                              'EVENLY' &&
                                              form.getValues().splitMode !==
                                                'BY_SHARES' && (
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
                                                              splitMode ===
                                                                'BY_SHARES' &&
                                                                'w-[6.5rem]',
                                                            )}
                                                            disabled={
                                                              !isParticipantSelected
                                                            }
                                                            splitMode={
                                                              splitMode
                                                            }
                                                            groupCurrency={
                                                              groupCurrency
                                                            }
                                                            locale={locale}
                                                            value={String(
                                                              field.value?.find(
                                                                ({
                                                                  participant,
                                                                }) =>
                                                                  participant ===
                                                                  id,
                                                              )?.shares ?? '',
                                                            )}
                                                            onValueChange={(
                                                              nextValue,
                                                            ) => {
                                                              const editedParticipantIds =
                                                                new Set(
                                                                  manuallyEditedParticipants,
                                                                )
                                                              editedParticipantIds.add(
                                                                id,
                                                              )

                                                              if (
                                                                splitMode ===
                                                                'BY_PERCENTAGE'
                                                              ) {
                                                                const percentage =
                                                                  Number(
                                                                    nextValue,
                                                                  )
                                                                let newPaidFor =
                                                                  field.value.map(
                                                                    (p) =>
                                                                      p.participant ===
                                                                      id
                                                                        ? {
                                                                            participant:
                                                                              id,
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

                                                                field.onChange(
                                                                  newPaidFor,
                                                                )
                                                                setManuallyEditedParticipants(
                                                                  editedParticipantIds,
                                                                )
                                                                return
                                                              }

                                                              const shareValue =
                                                                splitMode ===
                                                                'BY_AMOUNT'
                                                                  ? enforceCurrencyPattern(
                                                                      nextValue,
                                                                    )
                                                                  : nextValue
                                                              field.onChange(
                                                                field.value.map(
                                                                  (p) =>
                                                                    p.participant ===
                                                                    id
                                                                      ? {
                                                                          participant:
                                                                            id,
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
                                              className={
                                                participantFormItemClass
                                              }
                                            >
                                              <FormControl>
                                                <Checkbox
                                                  checked={field.value?.some(
                                                    ({ participant }) =>
                                                      participant === pf.userId,
                                                  )}
                                                  onCheckedChange={(
                                                    checked,
                                                  ) => {
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
                                                              participant:
                                                                pf.userId,
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
                                              <FormLabel className="flex min-w-0 flex-1 flex-col items-start gap-0 text-sm font-normal">
                                                <span className="w-full min-w-0 truncate">
                                                  {pf.user?.name ??
                                                    'Unknown user'}
                                                </span>
                                                {field.value?.some(
                                                  ({ participant }) =>
                                                    participant === pf.userId,
                                                ) &&
                                                  !form.watch(
                                                    'isReimbursement',
                                                  ) && (
                                                    <span className="text-muted-foreground">
                                                      (
                                                      {formatCurrency(
                                                        groupCurrency,
                                                        calculateShare(
                                                          pf.userId,
                                                          {
                                                            amount:
                                                              amountAsMinorUnits(
                                                                Number(
                                                                  form.watch(
                                                                    'amount',
                                                                  ),
                                                                ),
                                                                groupCurrency,
                                                              ),
                                                            paidFor:
                                                              field.value.map(
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
                                                                    ) ===
                                                                    'BY_PERCENTAGE'
                                                                      ? Number(
                                                                          shares,
                                                                        ) * 100
                                                                      : form.watch(
                                                                            'splitMode',
                                                                          ) ===
                                                                          'BY_AMOUNT'
                                                                        ? amountAsMinorUnits(
                                                                            shares,
                                                                            groupCurrency,
                                                                          )
                                                                        : shares,
                                                                }),
                                                              ),
                                                            splitMode:
                                                              form.watch(
                                                                'splitMode',
                                                              ),
                                                            isReimbursement:
                                                              form.watch(
                                                                'isReimbursement',
                                                              ),
                                                          },
                                                        ),
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

                                <SplitAllocationSummary
                                  splitMode={form.getValues('splitMode')}
                                  paidFor={form.getValues('paidFor') ?? []}
                                  amount={Number(form.getValues('amount')) || 0}
                                  currency={groupCurrency}
                                  locale={locale}
                                  evenlyLabel={(amount, count) =>
                                    t('evenlySplit', { amount, count })
                                  }
                                  totalWeightLabel={(count) =>
                                    t('totalWeight', { count })
                                  }
                                  matchesPercentLabel={t('matchesPercent')}
                                  matchesAmountLabel={(amount) =>
                                    t('matchesAmount', { amount })
                                  }
                                />

                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </SplitModeSelector>
                        <FormField
                          control={form.control}
                          name="saveDefaultSplittingOptions"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start gap-2 space-y-0 pt-1">
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
                      </FormItem>
                    )
                  }
                />
              </ExpenseFormCardCollapsible>

              {itemizedAvailable && (
                <>
                  <ExpenseFormCardCollapsible
                    title={t('itemized.sectionTitle')}
                    description={
                      showItemsSection
                        ? itemsAuthoritative
                          ? t('itemized.authoritativeNote')
                          : t('itemized.documentationNote')
                        : t('itemized.sectionDescription')
                    }
                    open={itemsExpanded}
                    onOpenChange={requestOpenItems}
                  >
                    {!showItemsSection ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddItemsSection}
                      >
                        {t('itemized.addItemsAction')}
                      </Button>
                    ) : (
                      <ItemizedExpenseEditor
                        participants={itemizedParticipants}
                        entryCurrency={
                          conversionRequired ? originalCurrency : groupCurrency
                        }
                        locale={locale}
                        authoritative={itemsAuthoritative}
                        entryTotalField={
                          conversionRequired ? 'originalAmount' : 'amount'
                        }
                        onRequestAuthoritativeEdit={requestAuthoritativeEdit}
                      />
                    )}
                  </ExpenseFormCardCollapsible>
                </>
              )}

              <ExpenseFormCardCollapsible
                title={t(`${sExpense}.paidByField.label`)}
                description={t(`${sExpense}.paidByField.description`)}
                open={paidByOpen}
                onOpenChange={setPaidByOpen}
              >
                <FormField
                  control={form.control}
                  name="paidBy"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <PayerSelector
                        participants={group.participants.map(
                          ({ id, name }) => ({
                            id,
                            name: name?.trim() || id,
                          }),
                        )}
                        value={(field.value ?? []) as PayerEntry[]}
                        onChange={field.onChange}
                        expenseTotal={Number(form.watch('amount')) || 0}
                        currency={groupCurrency}
                        locale={locale}
                        isReimbursement={form.watch('isReimbursement')}
                        singlePayerOnly={
                          singlePayerOnly || hasNonMembersInPaidFor
                        }
                        nonMemberSinglePayerNote={
                          hasNonMembersInPaidFor
                            ? t('decompositionBanner.singlePayerNote')
                            : undefined
                        }
                      />
                      <FormMessage />
                      <FormField
                        control={form.control}
                        name="saveDefaultPaidByOptions"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start gap-2 space-y-0 pt-1">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {t('PaidByField.saveAsDefault')}
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </FormItem>
                  )}
                />
              </ExpenseFormCardCollapsible>

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

          {/* Decomposition Banner — visible above submit when non-members are present (R6.1, R6.4, R6.5) */}
          {bannerNonMembers.length > 0 && (
            <div className="px-0 pt-2 pb-0">
              <DecompositionBanner
                nonMembers={bannerNonMembers}
                groupHalfAmountMajor={groupHalfAmountMajor}
                currency={groupCurrency}
                groupName={group.name}
              />
            </div>
          )}
        </form>
        {formFooter}
      </div>

      <DuplicateExpenseDialog
        open={duplicateMatches.length > 0}
        matches={duplicateMatches}
        newExpense={{
          title: pendingSubmitData?.title ?? '',
          amount: amountAsMinorUnits(
            Number(pendingSubmitData?.amount ?? 0),
            groupCurrency,
          ),
          expenseDate: pendingSubmitData?.expenseDate ?? new Date(),
          categoryId: pendingSubmitData?.category,
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

      {/* "Switch to itemised?" — shown when a split-affecting edit would turn
          documentation items into the authoritative split (Requirement 12.2). */}
      <AlertDialog
        open={pendingSwitchApply !== null}
        onOpenChange={(open) => {
          if (!open) cancelSwitchToItemized()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('itemized.switchDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('itemized.switchDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelSwitchToItemized}>
              {t('itemized.switchDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchToItemized}>
              {t('itemized.switchDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Leave itemised" — restore a legacy split, keep items as documentation
          (Requirement 13). */}
      <AlertDialog
        open={showLeaveItemizedDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowLeaveItemizedDialog(false)
            setOpenSplitAfterLeave(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('itemized.leaveDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('itemized.leaveDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowLeaveItemizedDialog(false)
                setOpenSplitAfterLeave(false)
              }}
            >
              {t('itemized.leaveDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeaveItemized}>
              {t('itemized.leaveDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  )
}
