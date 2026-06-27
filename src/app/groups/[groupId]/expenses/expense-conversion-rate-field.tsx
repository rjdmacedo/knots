'use client'

import { Button } from '@/components/ui/button'
import {
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
import { Switch } from '@/components/ui/switch'
import { Currency } from '@/lib/currency'
import {
  enforceCurrencyPattern,
  getCurrencyDisplaySymbol,
} from '@/lib/currency-input'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { ComponentProps, forwardRef, useState } from 'react'
import { Control } from 'react-hook-form'

type ExchangeRateInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: number | string | undefined | null
  onValueChange: (value: string) => void
}

const ExchangeRateInput = forwardRef<HTMLInputElement, ExchangeRateInputProps>(
  function ExchangeRateInput(
    { value, onValueChange, className, onFocus, onBlur, ...props },
    ref,
  ) {
    const [isFocused, setIsFocused] = useState(false)
    const [draft, setDraft] = useState('')

    const displayValue = isFocused
      ? draft
      : value === '' || value === undefined || value === null
        ? ''
        : String(value)

    return (
      <InputGroupInput
        {...props}
        ref={ref}
        className={cn('text-base tabular-nums', className)}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={displayValue}
        onFocus={(event) => {
          setIsFocused(true)
          setDraft(
            value === '' || value === undefined || value === null
              ? ''
              : String(value),
          )
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
  },
)

type ExpenseConversionRateFieldProps = {
  control: Control<ExpenseFormValues>
  originalCurrency: Currency
  groupCurrency: Currency
  exchangeRate: number | undefined
  usingCustomRate: boolean
  onUsingCustomRateChange: (enabled: boolean) => void
  onCustomRateChange?: (value: string) => void
  isLoading?: boolean
  exchangeError?: unknown
  onRefresh?: () => void
  className?: string
}

export function ExpenseConversionRateField({
  control,
  originalCurrency,
  groupCurrency,
  exchangeRate,
  usingCustomRate,
  onUsingCustomRateChange,
  onCustomRateChange,
  isLoading = false,
  exchangeError,
  onRefresh,
  className,
}: ExpenseConversionRateFieldProps) {
  const t = useTranslations('ExpenseForm')
  const ratePrefix = (
    <>
      {getCurrencyDisplaySymbol(originalCurrency)} 1 ={' '}
      {getCurrencyDisplaySymbol(groupCurrency)}
    </>
  )

  const automaticRateValue = exchangeRate != null ? String(exchangeRate) : '—'

  const labelRow = (
    <div className="flex items-center justify-between gap-2">
      <FormLabel>{t('conversionRateField.label')}</FormLabel>
      <div className="flex shrink-0 items-center gap-2">
        <label
          htmlFor="custom-conversion-rate"
          className="cursor-pointer text-xs font-normal text-muted-foreground"
        >
          {t('conversionRateField.useCustom')}
        </label>
        <Switch
          id="custom-conversion-rate"
          checked={usingCustomRate}
          onCheckedChange={onUsingCustomRateChange}
        />
      </div>
    </div>
  )

  const automaticRateDescription = (
    <>
      {isLoading ? (
        t('conversionRateState.loading')
      ) : exchangeError ? (
        <span className="flex flex-col items-start gap-0">
          {exchangeError instanceof RangeError && exchangeRate != null ? (
            <span>
              {t('conversionRateState.dateMismatch', {
                date: exchangeError.message,
              })}
            </span>
          ) : (
            <span>{t('conversionRateState.error')}</span>
          )}
          {!isLoading && onRefresh ? (
            <Button
              className="h-auto min-h-0 justify-start p-0 text-sm font-normal"
              type="button"
              variant="link"
              onClick={onRefresh}
            >
              {t('conversionRateState.refresh')}
            </Button>
          ) : null}
        </span>
      ) : !exchangeRate ? (
        t('conversionRateState.currencyNotFound')
      ) : (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {!isLoading && onRefresh ? (
            <Button
              className="h-auto min-h-0 justify-start p-0 text-sm font-normal"
              type="button"
              variant="link"
              onClick={onRefresh}
            >
              {t('conversionRateState.refresh')}
            </Button>
          ) : null}
        </span>
      )}
    </>
  )

  const rateInputGroup = (
    editable: boolean,
    fieldProps?: {
      onChange: (value: string) => void
      onBlur: () => void
      ref: React.Ref<HTMLInputElement>
      name: string
      value: number | string | undefined
    },
  ) => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText className="shrink-0 tabular-nums">
          {ratePrefix}
        </InputGroupText>
      </InputGroupAddon>
      {editable && fieldProps ? (
        <ExchangeRateInput
          ref={fieldProps.ref}
          name={fieldProps.name}
          onBlur={fieldProps.onBlur}
          value={fieldProps.value}
          onValueChange={(v) => {
            fieldProps.onChange(v)
            onCustomRateChange?.(v)
          }}
        />
      ) : (
        <InputGroupInput
          readOnly
          tabIndex={-1}
          className="text-base tabular-nums"
          value={automaticRateValue}
        />
      )}
    </InputGroup>
  )

  if (usingCustomRate) {
    return (
      <FormField
        control={control}
        name="conversionRate"
        render={({ field: { onChange, onBlur, ref, name, value } }) => (
          <FormItem className={cn('min-w-0', className)}>
            {labelRow}
            <FormControl>
              {rateInputGroup(true, { onChange, onBlur, ref, name, value })}
            </FormControl>
            <FormDescription>
              {t('conversionRateField.collapsibleDescription')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return (
    <FormItem className={cn('min-w-0', className)}>
      {labelRow}
      <FormControl>{rateInputGroup(false)}</FormControl>
      <FormDescription>{t('conversionRateField.description')}</FormDescription>
      {(isLoading || exchangeError || onRefresh || !exchangeRate) && (
        <FormDescription>{automaticRateDescription}</FormDescription>
      )}
    </FormItem>
  )
}
