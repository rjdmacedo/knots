'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { enUS, pt } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useMemo, useState } from 'react'

const localeMap = {
  'en-US': enUS,
  'pt-PT': pt,
} as const

type DatePickerProps = Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'onChange' | 'onBlur'
> & {
  value?: Date | null
  onChange?: (date: Date | null) => void
  onBlur?: () => void
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  onBlur,
  placeholder = 'Pick a date',
  className,
  disabled,
  id,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const locale = useLocale()
  const calendarLocale = localeMap[locale as keyof typeof localeMap] ?? enUS

  const formattedDate = useMemo(() => {
    if (!value || Number.isNaN(value.getTime())) return null
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      value,
    )
  }, [locale, value])

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          onBlur?.()
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!formattedDate}
            className={cn(
              'h-9 w-full justify-start border-input font-normal shadow-xs data-[empty=true]:text-muted-foreground',
              className,
            )}
            {...props}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {formattedDate ?? <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange?.(date ?? null)
            setOpen(false)
            onBlur?.()
          }}
          locale={calendarLocale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
