'use client'

import { InputGroupInput } from '@/components/ui/input-group'
import { Currency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  formatCurrencyInputValue,
  getCurrencyInputPlaceholder,
  valueToCurrencyDraft,
} from '@/lib/currency-input'
import { cn } from '@/lib/utils'
import { ComponentProps, forwardRef, useState } from 'react'

type CurrencyAmountInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: number | string | undefined | null
  onValueChange: (value: string) => void
  currency: Currency
  locale: string
}

export const CurrencyAmountInput = forwardRef<
  HTMLInputElement,
  CurrencyAmountInputProps
>(function CurrencyAmountInput(
  {
    value,
    onValueChange,
    currency,
    locale,
    className,
    onFocus,
    onBlur,
    ...props
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const displayValue = isFocused
    ? draft
    : formatCurrencyInputValue(value, locale, currency.decimal_digits)

  return (
    <InputGroupInput
      {...props}
      ref={ref}
      className={cn('text-base tabular-nums', className)}
      type="text"
      inputMode="decimal"
      placeholder={getCurrencyInputPlaceholder(locale, currency.decimal_digits)}
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true)
        setDraft(valueToCurrencyDraft(value))
        onFocus?.(event)
        const target = event.currentTarget
        setTimeout(() => target.select(), 1)
      }}
      onBlur={(event) => {
        setIsFocused(false)
        setDraft('')
        onBlur?.(event)
      }}
      onChange={(event) => {
        const normalized = enforceCurrencyPattern(event.target.value)
        setDraft(normalized)
        onValueChange(normalized)
      }}
    />
  )
})
