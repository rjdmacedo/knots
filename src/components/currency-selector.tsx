import { ChevronDown, Loader2 } from 'lucide-react'

import { Button, ButtonProps } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { InputGroupButton } from '@/components/ui/input-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Currency } from '@/lib/currency'
import { getCurrencyDisplaySymbol } from '@/lib/currency-input'
import { useMediaQuery } from '@/lib/hooks'
import { useIsClient } from 'foxact/use-is-client'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { forwardRef, useEffect, useState } from 'react'

type Props = {
  currencies: Currency[]
  onValueChange: (currencyCode: Currency['code']) => void
  /** Currency code to be selected by default. Overwriting this value will update current selection, too. */
  defaultValue: Currency['code']
  isLoading: boolean
  variant?: 'default' | 'inline'
}

export function CurrencySelector({
  currencies,
  onValueChange,
  defaultValue,
  isLoading,
  variant = 'default',
}: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string>(defaultValue)
  const isClient = useIsClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isInline = variant === 'inline'

  // allow overwriting currently selected currency from outside
  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const selectedCurrency =
    currencies.find((currency) => (currency.code ?? '') === value) ??
    currencies[0]

  const TriggerButton = isInline ? CurrencyInlineButton : CurrencyButton

  // Render Drawer initially to match SSR, then switch after client hydration
  if (!isClient || !isDesktop) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger
          render={
            <TriggerButton
              currency={selectedCurrency}
              open={open}
              isLoading={isLoading}
            />
          }
        />
        <DrawerContent className="p-0">
          <DrawerTitle className="sr-only">Select Currency</DrawerTitle>
          <CurrencyCommand
            currencies={currencies}
            onValueChange={(id) => {
              setValue(id)
              onValueChange(id)
              setOpen(false)
            }}
          />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <TriggerButton
            currency={selectedCurrency}
            open={open}
            isLoading={isLoading}
          />
        }
      />
      <PopoverContent className="p-0" align="start">
        <CurrencyCommand
          currencies={currencies}
          onValueChange={(code) => {
            setValue(code)
            onValueChange(code)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function CurrencyCommand({
  currencies,
  onValueChange,
}: {
  currencies: Currency[]
  onValueChange: (currencyId: Currency['code']) => void
}) {
  const currencyGroup = (currency: Currency) => {
    switch (currency.code) {
      case 'USD':
      case 'EUR':
      case 'JPY':
      case 'GBP':
      case 'CNY':
        return 'common'
      default:
        if (currency.code === '') return 'custom'
        return 'other'
    }
  }
  const t = useTranslations('Currencies')
  const currenciesByGroup = currencies.reduce<Record<string, Currency[]>>(
    (acc, currency) => ({
      ...acc,
      [currencyGroup(currency)]: (acc[currencyGroup(currency)] ?? []).concat([
        currency,
      ]),
    }),
    {},
  )

  return (
    <Command>
      <CommandInput placeholder={t('search')} className="text-base" />
      <CommandEmpty>{t('noCurrency')}</CommandEmpty>
      <div className="w-full max-h-[300px] overflow-y-auto">
        {Object.entries(currenciesByGroup).map(
          ([group, groupCurrencies], index) => (
            <CommandGroup key={index} heading={t(`${group}.heading`)}>
              {groupCurrencies.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name} ${currency.symbol}`}
                  onSelect={(currentValue) => {
                    onValueChange(currency.code)
                  }}
                >
                  <CurrencyLabel currency={currency} />
                </CommandItem>
              ))}
            </CommandGroup>
          ),
        )}
      </div>
    </Command>
  )
}

type CurrencyButtonProps = {
  currency: Currency
  open: boolean
  isLoading: boolean
}
const CurrencyButton = forwardRef<HTMLButtonElement, CurrencyButtonProps>(
  (
    { currency, open, isLoading, ...props }: ButtonProps & CurrencyButtonProps,
    ref,
  ) => {
    const iconClassName = 'ml-2 h-4 w-4 shrink-0 opacity-50'
    return (
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="flex w-full justify-between"
        ref={ref}
        {...props}
      >
        <CurrencyLabel currency={currency} />
        {isLoading ? (
          <Loader2 className={`animate-spin ${iconClassName}`} />
        ) : (
          <ChevronDown className={iconClassName} />
        )}
      </Button>
    )
  },
)
CurrencyButton.displayName = 'CurrencyButton'

const CurrencyInlineButton = forwardRef<
  HTMLButtonElement,
  Omit<CurrencyButtonProps, 'size'> & Omit<ButtonProps, 'size'>
>(({ currency, open, isLoading, ...props }, ref) => {
  return (
    <InputGroupButton
      ref={ref}
      role="combobox"
      aria-expanded={open}
      className="gap-1 font-medium text-foreground tabular-nums"
      {...props}
    >
      {getCurrencyDisplaySymbol(currency)}
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin opacity-50" />
      ) : (
        <ChevronDown className="size-3.5 opacity-50" />
      )}
    </InputGroupButton>
  )
})
CurrencyInlineButton.displayName = 'CurrencyInlineButton'

function CurrencyLabel({ currency }: { currency: Currency }) {
  const flagUrl = `https://flagcdn.com/h24/${
    currency?.code.length ? currency.code.slice(0, 2).toLowerCase() : 'un'
  }.png`
  return (
    <div className="flex items-center gap-3">
      <Image
        src={flagUrl}
        alt=""
        width={16}
        height={12}
        className="w-4 h-auto"
      />
      {currency.name}
      {currency.code ? ` (${currency.code})` : ''}
    </div>
  )
}
