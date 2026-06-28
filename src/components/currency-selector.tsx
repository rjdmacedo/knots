import { ChevronDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { InputGroupButton } from '@/components/ui/input-group'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { ComponentProps, forwardRef, useEffect, useState } from 'react'

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
  const isInline = variant === 'inline'

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const selectedCurrency =
    currencies.find((currency) => (currency.code ?? '') === value) ??
    currencies[0]

  const TriggerButton = isInline ? CurrencyInlineButton : CurrencyButton

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
      <PopoverContent
        className={cn(
          'p-0',
          isInline &&
            'w-72 min-w-72 max-w-[min(100vw-2rem,18rem)] [--anchor-width:18rem]',
        )}
        align={isInline ? 'end' : 'start'}
      >
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
      <CommandInput autoFocus placeholder={t('search')} className="text-base" />
      <CommandList>
        <CommandEmpty>{t('noCurrency')}</CommandEmpty>
        {Object.entries(currenciesByGroup).map(
          ([group, groupCurrencies], index) => (
            <CommandGroup key={index} heading={t(`${group}.heading`)}>
              {groupCurrencies.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={`${currency.code} ${currency.name} ${currency.symbol}`}
                  onSelect={() => {
                    onValueChange(currency.code)
                  }}
                >
                  <CurrencyLabel currency={currency} />
                </CommandItem>
              ))}
            </CommandGroup>
          ),
        )}
      </CommandList>
    </Command>
  )
}

type CurrencyButtonProps = {
  currency: Currency
  open: boolean
  isLoading: boolean
}
const CurrencyButton = forwardRef<
  HTMLButtonElement,
  CurrencyButtonProps & ComponentProps<typeof Button>
>(({ currency, open, isLoading, ...props }, ref) => {
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
})
CurrencyButton.displayName = 'CurrencyButton'

const CurrencyInlineButton = forwardRef<
  HTMLButtonElement,
  CurrencyButtonProps & ComponentProps<typeof InputGroupButton>
>(({ currency, open, isLoading, ...props }, ref) => {
  return (
    <InputGroupButton
      ref={ref}
      role="combobox"
      aria-expanded={open}
      onPointerDown={(event) => event.stopPropagation()}
      className="max-w-24 shrink-0 gap-1 px-1.5 font-normal text-foreground sm:max-w-40 sm:gap-1.5 sm:px-2"
      {...props}
    >
      <CurrencyFlagName currency={currency} className="min-w-0" compact />
      {isLoading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin opacity-50" />
      ) : (
        <ChevronDown className="size-3.5 shrink-0 opacity-50" />
      )}
    </InputGroupButton>
  )
})
CurrencyInlineButton.displayName = 'CurrencyInlineButton'

function getCurrencyFlagUrl(currency: Currency) {
  return `https://flagcdn.com/h24/${
    currency?.code.length ? currency.code.slice(0, 2).toLowerCase() : 'un'
  }.png`
}

export function CurrencyFlagName({
  currency,
  className,
  compact = false,
}: {
  currency: Currency
  className?: string
  compact?: boolean
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Image
        src={getCurrencyFlagUrl(currency)}
        alt=""
        width={16}
        height={12}
        className="h-auto w-4 shrink-0"
      />
      {compact ? (
        <>
          <span className="truncate sm:hidden">
            {currency.code || currency.symbol}
          </span>
          <span className="hidden truncate sm:inline">{currency.name}</span>
        </>
      ) : (
        <span className="truncate">{currency.name}</span>
      )}
    </span>
  )
}

function CurrencyLabel({ currency }: { currency: Currency }) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src={getCurrencyFlagUrl(currency)}
        alt=""
        width={16}
        height={12}
        className="h-auto w-4"
      />
      {currency.name}
      {currency.code ? ` (${currency.code})` : ''}
    </div>
  )
}
