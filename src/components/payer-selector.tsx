'use client'

import { CurrencyAmountInput } from '@/components/currency-amount-input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Locale } from '@/i18n'
import type { Currency } from '@/lib/currency'
import { getCurrencyDisplaySymbol } from '@/lib/currency-input'
import {
  distributeEqualAmounts,
  distributeWeightedAmounts,
} from '@/lib/distribute-amount'
import { formatCurrency } from '@/lib/utils'
import {
  Coins,
  Equal,
  Hash,
  Percent,
  User,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

export interface PayerEntry {
  participant: string
  amount: number | string
}

export type PayerMode =
  | 'single'
  | 'evenly'
  | 'by_shares'
  | 'by_percentage'
  | 'by_amount'

const MODE_ICONS: Record<PayerMode, LucideIcon> = {
  single: User,
  evenly: Equal,
  by_shares: Hash,
  by_percentage: Percent,
  by_amount: Coins,
}

function ModeIcon({ mode }: { mode: PayerMode }) {
  const Icon = MODE_ICONS[mode]
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/field-label:text-foreground group-has-data-checked/field-label:bg-primary/10 group-has-data-checked/field-label:text-primary"
    >
      <Icon className="size-4" />
    </span>
  )
}

export interface PayerSelectorProps {
  participants: Array<{ id: string; name: string }>
  value: PayerEntry[]
  onChange: (payers: PayerEntry[]) => void
  expenseTotal: number
  currency: Currency
  locale: Locale
  disabled?: boolean
  isReimbursement?: boolean
  /** When true, prevents multiple payers (friend/hybrid flows). */
  singlePayerOnly?: boolean
  /**
   * When set, renders an inline note below the single-payer selector.
   * Used to explain that non-members require a single payer (R5.8).
   */
  nonMemberSinglePayerNote?: string
}

function entryAmount(entry: PayerEntry): number {
  return typeof entry.amount === 'string'
    ? Number(entry.amount) || 0
    : entry.amount
}

function inferMode(value: PayerEntry[], forceSingle: boolean): PayerMode {
  if (forceSingle || value.length <= 1) return 'single'
  return 'by_amount'
}

export function PayerSelector({
  participants,
  value,
  onChange,
  expenseTotal,
  currency,
  locale,
  disabled = false,
  isReimbursement = false,
  singlePayerOnly = false,
  nonMemberSinglePayerNote,
}: PayerSelectorProps) {
  const t = useTranslations('Expenses')
  const idPrefix = useId()
  const forceSingle = singlePayerOnly || isReimbursement
  const decimalDigits = currency.decimal_digits

  const [mode, setMode] = useState<PayerMode>(() =>
    inferMode(value, forceSingle),
  )
  const [shares, setShares] = useState<Record<string, number>>(() =>
    Object.fromEntries(value.map((e) => [e.participant, 1])),
  )
  const [percentages, setPercentages] = useState<Record<string, number>>(() => {
    if (value.length === 0 || expenseTotal <= 0) {
      return Object.fromEntries(value.map((e) => [e.participant, 0]))
    }
    return Object.fromEntries(
      value.map((e) => [
        e.participant,
        Math.round((entryAmount(e) / expenseTotal) * 10000) / 100,
      ]),
    )
  })

  useEffect(() => {
    if (forceSingle && mode !== 'single') {
      setMode('single')
      const participant = value[0]?.participant ?? participants[0]?.id ?? ''
      if (participant) {
        onChange([{ participant, amount: expenseTotal }])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to forceSingle
  }, [forceSingle])

  const selectedIds = value.map((e) => e.participant)
  const selectedSet = new Set(selectedIds)

  const runningTotal = value.reduce((sum, entry) => sum + entryAmount(entry), 0)
  const hasMismatch =
    Math.round(runningTotal * 10 ** decimalDigits) !==
    Math.round(expenseTotal * 10 ** decimalDigits)

  const emitEvenly = (ids: string[]) => {
    if (ids.length === 0) {
      onChange([])
      return
    }
    const amounts = distributeEqualAmounts(
      expenseTotal,
      ids.length,
      decimalDigits,
    )
    onChange(ids.map((id, i) => ({ participant: id, amount: amounts[i] ?? 0 })))
  }

  const emitFromShares = (
    ids: string[],
    nextShares: Record<string, number>,
  ) => {
    if (ids.length === 0) {
      onChange([])
      return
    }
    const weights = ids.map((id) => nextShares[id] ?? 1)
    const amounts = distributeWeightedAmounts(
      expenseTotal,
      weights,
      decimalDigits,
    )
    onChange(ids.map((id, i) => ({ participant: id, amount: amounts[i] ?? 0 })))
  }

  const emitFromPercentages = (
    ids: string[],
    nextPct: Record<string, number>,
  ) => {
    if (ids.length === 0) {
      onChange([])
      return
    }
    const weights = ids.map((id) => nextPct[id] ?? 0)
    const amounts = distributeWeightedAmounts(
      expenseTotal,
      weights,
      decimalDigits,
    )
    onChange(ids.map((id, i) => ({ participant: id, amount: amounts[i] ?? 0 })))
  }

  const handleModeChange = (next: string | null) => {
    if (!next) return
    const nextMode = next as PayerMode
    if (forceSingle && nextMode !== 'single') return
    setMode(nextMode)

    if (nextMode === 'single') {
      const participant = value[0]?.participant ?? participants[0]?.id ?? ''
      if (participant) {
        onChange([{ participant, amount: expenseTotal }])
      }
      return
    }

    const ids =
      selectedIds.length > 0
        ? selectedIds
        : participants
            .slice(0, Math.min(2, participants.length))
            .map((p) => p.id)

    if (nextMode === 'evenly') {
      emitEvenly(ids)
    } else if (nextMode === 'by_shares') {
      const nextShares = { ...shares }
      for (const id of ids) {
        if (nextShares[id] == null) nextShares[id] = 1
      }
      setShares(nextShares)
      emitFromShares(ids, nextShares)
    } else if (nextMode === 'by_percentage') {
      const equal = ids.length > 0 ? Math.floor(10000 / ids.length) / 100 : 0
      const nextPct: Record<string, number> = {}
      let used = 0
      ids.forEach((id, i) => {
        const pct =
          i === ids.length - 1 ? Math.round((100 - used) * 100) / 100 : equal
        nextPct[id] = pct
        used += pct
      })
      setPercentages(nextPct)
      emitFromPercentages(ids, nextPct)
    } else {
      // by_amount — keep current amounts or seed evenly
      if (value.length <= 1) {
        emitEvenly(ids)
      }
    }
  }

  const handleSingleParticipant = (participantId: string) => {
    onChange([{ participant: participantId, amount: expenseTotal }])
  }

  const toggleParticipant = (participantId: string, checked: boolean) => {
    let ids = checked
      ? [...selectedIds, participantId]
      : selectedIds.filter((id) => id !== participantId)

    if (ids.length === 0 && participants[0]) {
      ids = [participants[0].id]
    }

    if (mode === 'evenly') {
      emitEvenly(ids)
    } else if (mode === 'by_shares') {
      const nextShares = { ...shares }
      if (checked && nextShares[participantId] == null) {
        nextShares[participantId] = 1
      }
      setShares(nextShares)
      emitFromShares(ids, nextShares)
    } else if (mode === 'by_percentage') {
      const nextPct = { ...percentages }
      if (checked && nextPct[participantId] == null) {
        nextPct[participantId] = 0
      }
      setPercentages(nextPct)
      emitFromPercentages(ids, nextPct)
    } else {
      // by_amount
      if (checked) {
        onChange([...value, { participant: participantId, amount: 0 }])
      } else {
        onChange(value.filter((e) => e.participant !== participantId))
      }
    }
  }

  const handleShareChange = (participantId: string, raw: string) => {
    const n = Number(raw)
    const nextShares = {
      ...shares,
      [participantId]: Number.isNaN(n) || n < 0 ? 0 : n,
    }
    setShares(nextShares)
    emitFromShares(selectedIds, nextShares)
  }

  const handlePercentageChange = (participantId: string, raw: string) => {
    const n = Number(raw)
    const nextPct = {
      ...percentages,
      [participantId]: Number.isNaN(n) || n < 0 ? 0 : n,
    }
    setPercentages(nextPct)
    emitFromPercentages(selectedIds, nextPct)
  }

  const handleAmountChange = (participantId: string, newAmount: string) => {
    const numericAmount = Number(newAmount)
    onChange(
      value.map((entry) =>
        entry.participant === participantId
          ? {
              ...entry,
              amount: Number.isNaN(numericAmount) ? newAmount : numericAmount,
            }
          : entry,
      ),
    )
  }

  // Keep evenly / shares / % in sync when expense total changes
  useEffect(() => {
    if (mode === 'evenly' && selectedIds.length > 0) {
      emitEvenly(selectedIds)
    } else if (mode === 'by_shares' && selectedIds.length > 0) {
      emitFromShares(selectedIds, shares)
    } else if (mode === 'by_percentage' && selectedIds.length > 0) {
      emitFromPercentages(selectedIds, percentages)
    } else if (mode === 'single' && value[0]) {
      const current = entryAmount(value[0])
      if (current !== expenseTotal) {
        onChange([{ ...value[0], amount: expenseTotal }])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseTotal])

  const formatMajorAsCurrency = (major: number) =>
    formatCurrency(currency, Math.round(major * 10 ** decimalDigits), locale)

  const multipleModes: Array<{
    mode: Exclude<PayerMode, 'single'>
    title: string
    description: string
  }> = [
    {
      mode: 'evenly',
      title: t('paidBy.evenlyTitle'),
      description: t('paidBy.evenlyDescription'),
    },
    {
      mode: 'by_shares',
      title: t('paidBy.bySharesTitle'),
      description: t('paidBy.bySharesDescription'),
    },
    {
      mode: 'by_percentage',
      title: t('paidBy.byPercentageTitle'),
      description: t('paidBy.byPercentageDescription'),
    },
    {
      mode: 'by_amount',
      title: t('paidBy.byAmountTitle'),
      description: t('paidBy.byAmountDescription'),
    },
  ]

  const renderParticipantControls = () => (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {t('paidBy.selectPayers')}
      </p>
      {participants.map((p) => {
        const checked = selectedSet.has(p.id)
        const amountEntry = value.find((e) => e.participant === p.id)
        return (
          <div key={p.id} className="flex items-center gap-2">
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(state) =>
                toggleParticipant(p.id, state === true)
              }
              aria-label={p.name}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
            {checked && mode === 'by_shares' && (
              <InputGroup className="w-24 shrink-0">
                <InputGroupInput
                  type="number"
                  min={0}
                  step={1}
                  disabled={disabled}
                  value={shares[p.id] ?? 1}
                  onChange={(e) => handleShareChange(p.id, e.target.value)}
                  aria-label={t('paidBy.shareLabel')}
                />
              </InputGroup>
            )}
            {checked && mode === 'by_percentage' && (
              <InputGroup className="w-28 shrink-0">
                <InputGroupInput
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  disabled={disabled}
                  value={percentages[p.id] ?? 0}
                  onChange={(e) => handlePercentageChange(p.id, e.target.value)}
                  aria-label={t('paidBy.percentageLabel')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            )}
            {checked && mode === 'by_amount' && (
              <InputGroup className="min-w-0 w-36 shrink-0">
                <InputGroupAddon align="inline-start">
                  <InputGroupText className="font-medium text-foreground tabular-nums">
                    {getCurrencyDisplaySymbol(currency)}
                  </InputGroupText>
                </InputGroupAddon>
                <CurrencyAmountInput
                  disabled={disabled}
                  currency={currency}
                  locale={locale}
                  value={amountEntry ? entryAmount(amountEntry) : 0}
                  onValueChange={(val) => handleAmountChange(p.id, val)}
                />
              </InputGroup>
            )}
            {checked && mode === 'evenly' && amountEntry && (
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatMajorAsCurrency(entryAmount(amountEntry))}
              </span>
            )}
          </div>
        )
      })}

      {mode === 'by_amount' && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <span className="text-muted-foreground">
            {t('paidBy.total')}: {formatMajorAsCurrency(runningTotal)}
          </span>
          {hasMismatch && (
            <Badge variant="destructive">
              {runningTotal > expenseTotal
                ? t('paidBy.overpayment', {
                    amount: formatMajorAsCurrency(runningTotal - expenseTotal),
                  })
                : t('paidBy.underpayment', {
                    amount: formatMajorAsCurrency(expenseTotal - runningTotal),
                  })}
            </Badge>
          )}
        </div>
      )}
    </div>
  )

  return (
    <RadioGroup
      value={mode}
      onValueChange={handleModeChange}
      disabled={disabled}
      className="flex flex-col gap-3"
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('paidBy.singleSection')}
      </p>
      <FieldLabel htmlFor={`${idPrefix}-single`}>
        <Field orientation="horizontal">
          <ModeIcon mode="single" />
          <FieldContent>
            <FieldTitle>{t('paidBy.singleTitle')}</FieldTitle>
            <FieldDescription>{t('paidBy.singleDescription')}</FieldDescription>
            {mode === 'single' && (
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                <Select
                  value={value[0]?.participant ?? ''}
                  items={participants.map((p) => ({
                    value: p.id,
                    label: p.name.trim() || p.id,
                  }))}
                  onValueChange={(val) => handleSingleParticipant(val ?? '')}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name.trim() || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nonMemberSinglePayerNote && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {nonMemberSinglePayerNote}
                  </p>
                )}
              </div>
            )}
          </FieldContent>
          <RadioGroupItem
            value="single"
            id={`${idPrefix}-single`}
            disabled={disabled}
          />
        </Field>
      </FieldLabel>

      {!forceSingle && (
        <>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('paidBy.multipleSection')}
          </p>
          {multipleModes.map(({ mode: m, title, description }) => (
            <FieldLabel key={m} htmlFor={`${idPrefix}-${m}`}>
              <Field orientation="horizontal">
                <ModeIcon mode={m} />
                <FieldContent>
                  <FieldTitle>{title}</FieldTitle>
                  <FieldDescription>{description}</FieldDescription>
                  {mode === m && (
                    <div onClick={(e) => e.stopPropagation()}>
                      {renderParticipantControls()}
                    </div>
                  )}
                </FieldContent>
                <RadioGroupItem
                  value={m}
                  id={`${idPrefix}-${m}`}
                  disabled={disabled}
                />
              </Field>
            </FieldLabel>
          ))}
        </>
      )}
    </RadioGroup>
  )
}
