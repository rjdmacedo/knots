import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import {
  SearchSelector,
  type SearchSelectorGroup,
  type SearchSelectorItem,
} from '@/components/search-selector'
import { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'

type Props = {
  currencies: Currency[]
  onValueChange: (currencyCode: Currency['code']) => void
  /** Currency code to be selected by default. Overwriting this value will update current selection, too. */
  defaultValue: Currency['code']
  isLoading: boolean
  variant?: 'default' | 'inline'
  id?: string
}

export function CurrencySelector({
  currencies,
  onValueChange,
  defaultValue,
  isLoading,
  variant = 'default',
  id,
}: Props) {
  const t = useTranslations('Currencies')
  const [value, setValue] = useState<string>(defaultValue)
  const isInline = variant === 'inline'

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const selected =
    currencies.find((currency) => (currency.code ?? '') === value) ??
    currencies[0]

  return (
    <SearchSelector
      id={id}
      value={value}
      onValueChange={(code) => {
        setValue(code)
        onValueChange(code)
      }}
      groups={currencyGroups(currencies, (key) => t(`${key}.heading`))}
      placeholder={t('search')}
      empty={t('noCurrency')}
      isLoading={isLoading}
      variant={variant}
      inlineLabel={
        isInline && selected ? (
          <CurrencyFlagName currency={selected} className="min-w-0" compact />
        ) : undefined
      }
    />
  )
}

const CURRENCY_GROUP_ORDER = ['common', 'custom', 'other'] as const

function currencyGroupKey(currency: Currency) {
  switch (currency.code) {
    case 'USD':
    case 'EUR':
    case 'JPY':
    case 'GBP':
    case 'CNY':
      return 'common'
    default:
      return currency.code === '' ? 'custom' : 'other'
  }
}

function currencyGroups(
  currencies: Currency[],
  heading: (key: (typeof CURRENCY_GROUP_ORDER)[number]) => string,
): SearchSelectorGroup[] {
  const grouped: Record<string, SearchSelectorItem[]> = {}

  for (const currency of currencies) {
    const key = currencyGroupKey(currency)
    grouped[key] ??= []
    grouped[key].push({
      value: currency.code,
      label: currency.code
        ? `${currency.name} (${currency.code})`
        : currency.name,
      keywords: `${currency.code} ${currency.name} ${currency.symbol}`,
      icon: (
        <Image
          src={getCurrencyFlagUrl(currency)}
          alt=""
          width={16}
          height={12}
          className="h-auto w-4 shrink-0"
        />
      ),
    })
  }

  return CURRENCY_GROUP_ORDER.filter((key) => grouped[key]?.length).map(
    (key) => ({
      heading: heading(key),
      items: grouped[key],
    }),
  )
}

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
