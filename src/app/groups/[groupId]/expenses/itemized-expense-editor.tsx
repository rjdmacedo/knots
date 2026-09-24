'use client'

import { CurrencyAmountInput } from '@/components/currency-amount-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FormControl,
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
import { Locale } from '@/i18n'
import { Currency } from '@/lib/currency'
import { getCurrencyDisplaySymbol } from '@/lib/currency-input'
import {
  computeItemizedShares,
  itemsExceedExpenseAmount,
} from '@/lib/itemized-split'
import { ExpenseFormValues } from '@/lib/schemas'
import { amountAsMinorUnits, cn, formatCurrency } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'

type Participant = { id: string; name: string }

/**
 * Line total in major units from unit price × quantity, computed via minor
 * units so cents stay exact (Requirement 14).
 */
function lineAmountMajor(
  unitPriceMajor: number,
  quantity: number,
  currency: Currency,
): number {
  const factor = 10 ** currency.decimal_digits
  const unitMinor = amountAsMinorUnits(Number(unitPriceMajor) || 0, currency)
  const qty = Math.max(1, Math.trunc(Number(quantity)) || 1)
  return (unitMinor * qty) / factor
}

/**
 * Editor for the optional itemized mode. Owns the line-item list and keeps the
 * parent form's `paidFor` in sync as a BY_AMOUNT split derived from the items
 * (in the entry currency's major units, zero-share participants dropped). The
 * main form converts to minor units once, in proceedWithSubmit.
 *
 * `entryCurrency` is the currency the user is entering in (original when a
 * conversion is required, group currency otherwise) — the itemized preview and
 * derived shares are computed in it.
 */
export function ItemizedExpenseEditor({
  participants,
  entryCurrency,
  locale,
  authoritative,
  entryTotalField,
  onRequestAuthoritativeEdit,
}: {
  participants: Participant[]
  entryCurrency: Currency
  locale: Locale
  /** Whether items currently drive the split. */
  authoritative: boolean
  /**
   * The form field holding the editable Entry_Total that the editor computes
   * against. When a conversion is required this is `originalAmount` (the
   * Entry_Currency total the server converts, Requirement 18); otherwise it is
   * `amount` (the group-currency total). Items and the "Other" remainder are all
   * in the Entry_Currency, so the editor never reads the converted `amount`
   * while FX is active.
   */
  entryTotalField: 'amount' | 'originalAmount'
  /**
   * Gate a split-affecting edit (assigning an item, changing the "Other"
   * allocation). When itemization is already authoritative the edit runs
   * immediately; otherwise the parent shows the "Switch to itemised?"
   * confirmation and applies `applyEdit` on confirm.
   */
  onRequestAuthoritativeEdit: (applyEdit: () => void) => void
}) {
  const t = useTranslations('ExpenseForm.itemized')
  const form = useFormContext<ExpenseFormValues>()

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'itemization.items',
  })

  const items = form.watch('itemization.items') ?? []
  const allocationMode =
    form.watch('itemization.remainder.allocationMode') ?? 'PROPORTIONAL'
  // The Entry_Total is editable and owned by the main total field (Requirement
  // 17.1). Under FX this is `originalAmount` (Entry_Currency); otherwise it is
  // `amount` (group currency). The "Other" remainder is DERIVED from it.
  const totalMajor = Number(form.watch(entryTotalField)) || 0

  const decimalDigits = entryCurrency.decimal_digits
  const factor = 10 ** decimalDigits

  const itemsSumMinor = items.reduce((sum, item) => {
    const unitMinor = amountAsMinorUnits(
      Number(item.unitPrice ?? item.amount) || 0,
      entryCurrency,
    )
    const qty = Math.max(1, Math.trunc(Number(item.quantity)) || 1)
    return sum + unitMinor * qty
  }, 0)
  const totalMinor = amountAsMinorUnits(totalMajor, entryCurrency)
  // Item_Remainder = total − Σ items (signed). Shown as the "Other" line.
  const remainderMinor = totalMinor - itemsSumMinor
  // Overshoot: items exceed the total in the expense's sign direction (R17.2).
  const overshoot = itemsExceedExpenseAmount(itemsSumMinor, totalMinor)

  // Serialized dependency keys so the sync effect re-runs on item/participant
  // content changes (extracted per react-hooks/exhaustive-deps guidance).
  const itemsKey = JSON.stringify(items)
  const participantIdsKey = JSON.stringify(participants.map((p) => p.id))

  const syncLineAmount = (index: number, unitPrice: number, quantity: number) => {
    form.setValue(
      `itemization.items.${index}.amount`,
      lineAmountMajor(unitPrice, quantity, entryCurrency) as unknown as number,
      { shouldDirty: true, shouldValidate: true },
    )
  }

  // Keep itemization.remainder.amount in sync with the derived remainder
  // (major units) so it is persisted and reloaded correctly. Derived, not
  // user-entered.
  useEffect(() => {
    if (!authoritative) return
    form.setValue('itemization.remainder.amount', remainderMinor / factor, {
      shouldDirty: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authoritative, remainderMinor, factor, entryTotalField])

  // Derive the BY_AMOUNT paidFor split (major units) from the items + the
  // derived "Other" remainder and push it into the parent form — ONLY when
  // itemization is authoritative and there is no overshoot. While the items are
  // documentation (authoritative = false) the legacy split owns paidFor and this
  // effect is a no-op. The editor does NOT set `amount`: the total is editable
  // and owned by the user. The single minor-unit conversion happens in
  // proceedWithSubmit.
  useEffect(() => {
    if (!authoritative) return
    if (overshoot) return // invalid; the overshoot warning is shown instead
    // Requirement 8.1: every item must be assigned before the splitter runs.
    // Mid-edit rows often have empty assignees; calling compute with those
    // amounts would drop them from shares while still counting them in the
    // total and throw the exactness invariant.
    if (
      items.some((item) => (item.assignedParticipants ?? []).length === 0)
    ) {
      return
    }
    const participantIdsInOrder = participants.map((p) => p.id)
    const result = computeItemizedShares({
      participantIdsInOrder,
      items: items.map((item) => {
        const unitMinor = amountAsMinorUnits(
          Number(item.unitPrice ?? item.amount) || 0,
          entryCurrency,
        )
        const qty = Math.max(1, Math.trunc(Number(item.quantity)) || 1)
        return {
          amountMinor: unitMinor * qty,
          assignedParticipantIds: item.assignedParticipants ?? [],
        }
      }),
      remainder: {
        amountMinor: remainderMinor,
        allocationMode: allocationMode === 'CUSTOM' ? 'CUSTOM' : 'PROPORTIONAL',
      },
    })

    const nextPaidFor = result.perParticipant
      .filter((p) => p.amountMinor > 0)
      .map((p) => ({
        participant: p.participantId,
        // Back to major units — proceedWithSubmit re-converts to minor once.
        shares: p.amountMinor / factor,
      }))

    form.setValue('paidFor', nextPaidFor, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue('splitMode', 'BY_AMOUNT', { shouldDirty: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authoritative,
    overshoot,
    itemsKey,
    remainderMinor,
    allocationMode,
    participantIdsKey,
    factor,
    entryTotalField,
  ])

  const handleSetAmountFromItems = () => {
    // Set the Entry_Total (originalAmount under FX, else amount) to Σ items so
    // the remainder becomes zero. The FX effect derives the group `amount`.
    form.setValue(entryTotalField, itemsSumMinor / factor, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('noItems')}</p>
      )}

      {fields.map((field, index) => {
        const unitPrice = Number(items[index]?.unitPrice ?? items[index]?.amount) || 0
        const quantity = Math.max(1, Math.trunc(Number(items[index]?.quantity)) || 1)
        const lineMinor =
          amountAsMinorUnits(unitPrice, entryCurrency) * quantity

        return (
          <div
            key={field.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <div className="flex items-start gap-2">
              <FormItem className="min-w-0 flex-1">
                <FormLabel className="text-xs">{t('itemTitleLabel')}</FormLabel>
                <FormControl>
                  <Input
                    className="text-sm"
                    value={items[index]?.title ?? ''}
                    onChange={(e) =>
                      form.setValue(
                        `itemization.items.${index}.title`,
                        e.target.value,
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                    placeholder={t('itemTitlePlaceholder')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6 shrink-0"
                aria-label={t('removeItem')}
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <FormItem className="w-28 grow sm:grow-0">
                <FormLabel className="text-xs">
                  {t('itemUnitPriceLabel')}
                </FormLabel>
                <FormControl>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <InputGroupText className="font-medium text-foreground tabular-nums">
                        {getCurrencyDisplaySymbol(entryCurrency)}
                      </InputGroupText>
                    </InputGroupAddon>
                    <CurrencyAmountInput
                      currency={entryCurrency}
                      locale={locale}
                      value={items[index]?.unitPrice ?? items[index]?.amount ?? ''}
                      onValueChange={(v) => {
                        const nextUnit = v as unknown as number
                        form.setValue(
                          `itemization.items.${index}.unitPrice`,
                          nextUnit,
                          { shouldDirty: true, shouldValidate: true },
                        )
                        syncLineAmount(
                          index,
                          Number(v) || 0,
                          items[index]?.quantity ?? 1,
                        )
                      }}
                      className="text-sm"
                    />
                  </InputGroup>
                </FormControl>
                <FormMessage />
              </FormItem>

              <span className="mb-2 text-sm text-muted-foreground">×</span>

              <FormItem className="w-16">
                <FormLabel className="text-xs">
                  {t('itemQuantityLabel')}
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="text-sm tabular-nums"
                    value={items[index]?.quantity ?? 1}
                    onChange={(e) => {
                      const raw = e.target.value
                      const nextQty = Math.max(
                        1,
                        Math.trunc(Number(raw)) || 1,
                      )
                      form.setValue(
                        `itemization.items.${index}.quantity`,
                        nextQty,
                        { shouldDirty: true, shouldValidate: true },
                      )
                      syncLineAmount(
                        index,
                        Number(
                          items[index]?.unitPrice ?? items[index]?.amount,
                        ) || 0,
                        nextQty,
                      )
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              <div className="mb-2 flex min-w-22 flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('itemLineTotalLabel')}
                </span>
                <span className="text-sm font-medium tabular-nums">
                  {formatCurrency(entryCurrency, lineMinor, locale)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t('assignTo')}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {participants.map((participant) => {
                  const assigned =
                    items[index]?.assignedParticipants?.includes(
                      participant.id,
                    ) ?? false
                  return (
                    <label
                      key={participant.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={assigned}
                        onCheckedChange={(checked) => {
                          // Assigning an item is a split-affecting edit: gate it
                          // behind the "Switch to itemised?" confirmation when the
                          // items are still documentation (Requirement 12.2).
                          onRequestAuthoritativeEdit(() => {
                            const current =
                              form.getValues(
                                `itemization.items.${index}.assignedParticipants`,
                              ) ?? []
                            const next = checked
                              ? [...current, participant.id]
                              : current.filter((id) => id !== participant.id)
                            form.setValue(
                              `itemization.items.${index}.assignedParticipants`,
                              next,
                              { shouldDirty: true, shouldValidate: true },
                            )
                          })
                        }}
                      />
                      <span
                        className={cn(!assigned && 'text-muted-foreground')}
                      >
                        {participant.name}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          append({
            title: '',
            unitPrice: 0,
            quantity: 1,
            amount: 0,
            assignedParticipants: [],
          })
        }
      >
        <Plus className="mr-1 h-4 w-4" />
        {t('addItem')}
      </Button>

      {/* Overshoot guard (Requirement 17.2): items exceed the editable total.
          Offer a quick "set amount from items" fix. */}
      {overshoot && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>{t('itemsExceedTotal')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:text-destructive"
            onClick={handleSetAmountFromItems}
          >
            {t('setAmountFromItems')}
          </Button>
        </div>
      )}

      {/* The "Other" remainder (tax / tip / service) is DERIVED from the editable
          total: Other = total − Σ items. Shown read-only; edit the total or the
          items to change it. */}
      {!overshoot && remainderMinor !== 0 && (
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <div>
            <span className="font-medium">{t('otherLabel')}</span>
            <p className="text-xs text-muted-foreground">
              {t('otherDerivedNote')}
            </p>
          </div>
          <span className="font-medium tabular-nums">
            {formatCurrency(entryCurrency, remainderMinor, locale)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="font-medium">{t('total')}</span>
        <span className="font-medium tabular-nums">
          {formatCurrency(entryCurrency, totalMinor, locale)}
        </span>
      </div>
    </div>
  )
}
