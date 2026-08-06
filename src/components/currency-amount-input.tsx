'use client'

import { InputGroupInput } from '@/components/ui/input-group'
import { Currency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  enforceExpressionPattern,
  formatCurrencyInputValue,
  getCurrencyInputPlaceholder,
  valueToCurrencyDraft,
} from '@/lib/currency-input'
import { evaluate, isExpression } from '@/lib/math-expression'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('CurrencyAmountInput')

  const displayValue = isFocused
    ? draft
    : formatCurrencyInputValue(value, locale, currency.decimal_digits)

  const placeholder = `${getCurrencyInputPlaceholder(locale, currency.decimal_digits)} ${t('expressionHint')}`

  return (
    <InputGroupInput
      {...props}
      ref={ref}
      className={cn('text-base tabular-nums', className)}
      type="text"
      inputMode="text"
      placeholder={placeholder}
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

        if (isExpression(draft)) {
          const result = evaluate(draft)
          if (result.ok) {
            onValueChange(String(result.value))
          } else {
            // Propagate raw draft for schema validation to catch
            onValueChange(draft)
          }
        }

        setDraft('')
        onBlur?.(event)
      }}
      onChange={(event) => {
        const raw = event.target.value
        // If input contains operator characters, use expression-aware filtering
        const normalized =
          /[+*/()]/.test(raw) || (raw.includes('-') && !raw.startsWith('-'))
            ? enforceExpressionPattern(raw)
            : enforceCurrencyPattern(raw)
        setDraft(normalized)
        onValueChange(normalized)
      }}
    />
  )
})
