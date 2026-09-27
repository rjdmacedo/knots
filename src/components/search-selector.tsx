'use client'

import { ChevronDown, Loader2 } from 'lucide-react'
import {
  type ComponentProps,
  forwardRef,
  type ReactNode,
  useState,
} from 'react'

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
import { cn } from '@/lib/utils'

export type SearchSelectorItem = {
  value: string
  label: ReactNode
  /** Text the command palette filters on. */
  keywords: string
  icon?: ReactNode
}

export type SearchSelectorGroup = {
  heading?: string
  items: SearchSelectorItem[]
}

type SearchSelectorProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  /** Ordered groups. Empty groups are skipped. The first is typically "Most common". */
  groups: SearchSelectorGroup[]
  placeholder: string
  empty: string
  /** Trigger text when no item matches `value`. */
  unselectedLabel?: ReactNode
  disabled?: boolean
  isLoading?: boolean
  variant?: 'default' | 'inline'
  /** Compact contents of the inline trigger. Falls back to the selected item. */
  inlineLabel?: ReactNode
}

export function SearchSelector({
  id,
  value,
  onValueChange,
  groups,
  placeholder,
  empty,
  unselectedLabel,
  disabled = false,
  isLoading = false,
  variant = 'default',
  inlineLabel,
}: SearchSelectorProps) {
  const [open, setOpen] = useState(false)
  const isInline = variant === 'inline'
  const visibleGroups = groups.filter((group) => group.items.length > 0)
  const selected = visibleGroups
    .flatMap((group) => group.items)
    .find((item) => item.value === value)

  function select(next: string) {
    onValueChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          isInline ? (
            <InlineTrigger
              open={open}
              isLoading={isLoading}
              disabled={disabled}
              label={inlineLabel ?? <ItemLabel item={selected} value={value} />}
            />
          ) : (
            <DefaultTrigger
              id={id}
              open={open}
              isLoading={isLoading}
              disabled={disabled}
              item={selected}
              value={value}
              unselectedLabel={unselectedLabel}
            />
          )
        }
      />
      <PopoverContent
        align={isInline ? 'end' : 'start'}
        className={cn(
          'p-0',
          isInline ? 'w-max max-w-(--available-width)' : 'w-(--anchor-width)',
        )}
      >
        <Command
          className={cn('h-auto', isInline ? 'w-max max-w-full' : 'w-full')}
        >
          <CommandInput autoFocus placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            {visibleGroups.map((group) => (
              <CommandGroup
                key={group.heading ?? 'items'}
                heading={group.heading}
              >
                {group.items.map((item, index) => (
                  <CommandItem
                    key={`${group.heading ?? 'items'}-${item.value}-${index}`}
                    value={item.keywords}
                    data-checked={item.value === value}
                    className="w-full"
                    onSelect={() => select(item.value)}
                  >
                    <ItemLabel item={item} value={item.value} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ItemLabel({
  item,
  value,
}: {
  item: SearchSelectorItem | undefined
  value: string
}) {
  if (!item) {
    return <span className="truncate">{value}</span>
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {item.icon}
      <span className="min-w-0 flex-1 text-left">{item.label}</span>
    </span>
  )
}

const DefaultTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & {
    open: boolean
    isLoading: boolean
    item: SearchSelectorItem | undefined
    value: string
    unselectedLabel?: ReactNode
  }
>(function DefaultTrigger(
  { open, isLoading, item, value, unselectedLabel, className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn('flex w-full justify-between text-left', className)}
      {...props}
    >
      {item ? (
        <ItemLabel item={item} value={value} />
      ) : (
        <span className="truncate text-muted-foreground">
          {unselectedLabel ?? value}
        </span>
      )}
      <TriggerIcon isLoading={isLoading} />
    </Button>
  )
})

const InlineTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof InputGroupButton> & {
    open: boolean
    isLoading: boolean
    label: ReactNode
  }
>(function InlineTrigger({ open, isLoading, label, className, ...props }, ref) {
  return (
    <InputGroupButton
      ref={ref}
      role="combobox"
      aria-expanded={open}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'max-w-24 shrink-0 gap-1 px-1.5 font-normal text-foreground sm:max-w-40 sm:gap-1.5 sm:px-2',
        className,
      )}
      {...props}
    >
      {label}
      <TriggerIcon isLoading={isLoading} compact />
    </InputGroupButton>
  )
})

function TriggerIcon({
  isLoading,
  compact = false,
}: {
  isLoading: boolean
  compact?: boolean
}) {
  const className = compact
    ? 'size-3.5 shrink-0 opacity-50'
    : 'ml-2 h-4 w-4 shrink-0 opacity-50'

  if (isLoading) {
    return <Loader2 className={cn('animate-spin', className)} />
  }

  return <ChevronDown className={className} />
}
