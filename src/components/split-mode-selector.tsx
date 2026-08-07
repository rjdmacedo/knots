'use client'

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { Coins, Equal, Hash, Percent, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, type ReactNode } from 'react'

export type SplitModeValue =
  | 'EVENLY'
  | 'BY_SHARES'
  | 'BY_PERCENTAGE'
  | 'BY_AMOUNT'

const MODE_ICONS: Record<SplitModeValue, LucideIcon> = {
  EVENLY: Equal,
  BY_SHARES: Hash,
  BY_PERCENTAGE: Percent,
  BY_AMOUNT: Coins,
}

function ModeIcon({ mode }: { mode: SplitModeValue }) {
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

export interface SplitModeSelectorProps {
  value: SplitModeValue
  onChange: (mode: SplitModeValue) => void
  disabled?: boolean
  /** Rendered inside the selected mode card (participant list, etc.). */
  children?: ReactNode
  className?: string
}

export function SplitModeSelector({
  value,
  onChange,
  disabled = false,
  children,
  className,
}: SplitModeSelectorProps) {
  const t = useTranslations('ExpenseForm.SplitModeField')
  const idPrefix = useId()

  const modes: Array<{
    mode: SplitModeValue
    title: string
    description: string
  }> = [
    {
      mode: 'EVENLY',
      title: t('evenly'),
      description: t('evenlyDescription'),
    },
    {
      mode: 'BY_SHARES',
      title: t('byShares'),
      description: t('bySharesDescription'),
    },
    {
      mode: 'BY_PERCENTAGE',
      title: t('byPercentage'),
      description: t('byPercentageDescription'),
    },
    {
      mode: 'BY_AMOUNT',
      title: t('byAmount'),
      description: t('byAmountDescription'),
    },
  ]

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as SplitModeValue)}
      disabled={disabled}
      className={cn('flex flex-col gap-3', className)}
    >
      {modes.map(({ mode, title, description }) => (
        <FieldLabel key={mode} htmlFor={`${idPrefix}-${mode}`}>
          <Field orientation="horizontal">
            <ModeIcon mode={mode} />
            <FieldContent>
              <FieldTitle>{title}</FieldTitle>
              <FieldDescription>{description}</FieldDescription>
              {value === mode && children ? (
                <div
                  className="pt-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {children}
                </div>
              ) : null}
            </FieldContent>
            <RadioGroupItem
              value={mode}
              id={`${idPrefix}-${mode}`}
              disabled={disabled}
            />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  )
}
