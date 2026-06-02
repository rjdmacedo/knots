'use client'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

const COMMON_TIMEZONES = Intl.supportedValuesOf('timeZone')

function formatTimezoneLabel(tz: string): string {
  try {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(now)
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')
    const offset = offsetPart?.value ?? ''
    return `(${offset}) ${tz.replace(/_/g, ' ')}`
  } catch {
    return tz.replace(/_/g, ' ')
  }
}

export function TimezoneSelect({
  currentTimezone,
}: {
  currentTimezone: string | null
}) {
  const t = useTranslations('ProfileSettings.Preferences')
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(
    currentTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  )

  const utils = trpc.useUtils()
  const changePreferences = trpc.profile.changePreferences.useMutation({
    onSuccess: () => {
      toast.success(t('timezoneSaved'))
      utils.profile.getProfile.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function handleSelect(tz: string) {
    setValue(tz)
    setOpen(false)
    changePreferences.mutate({ timezone: tz })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={changePreferences.isPending}
        >
          <span className="truncate">
            {value ? formatTimezoneLabel(value) : t('timezoneSelect')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={t('timezoneSearch')} />
          <CommandEmpty>{t('timezoneEmpty')}</CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-y-auto">
            {COMMON_TIMEZONES.map((tz) => (
              <CommandItem
                key={tz}
                value={tz}
                onSelect={() => handleSelect(tz)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === tz ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {formatTimezoneLabel(tz)}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
