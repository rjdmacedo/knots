'use client'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { Command as CommandPrimitive } from 'cmdk'
import { X } from 'lucide-react'
import React, { useEffect } from 'react'
import { Pill } from './pill'

export type Tag<T> = {
  label: string
  value: T
}

export type TagSuggestionGroup<T> = {
  heading?: string
  tags: Tag<T>[]
  isDisabled?: (tag: Tag<T>) => boolean
}

interface TagInputProps<T> {
  tags: Tag<T>[]
  setTags: (tags: Tag<T>[]) => void
  allTags?: Tag<T>[]
  suggestionGroups?: TagSuggestionGroup<T>[]
  onSelectTag?: (tag: Tag<T>) => void
  onRemoveTag?: (tag: Tag<T>) => void
  onClearTags?: () => void
  getTagSearchValue?: (tag: Tag<T>) => string
  AllTagsLabel?: ({ value }: { value: T }) => React.ReactNode
  placeholder?: string
  className?: string
  pillClassName?: string
  emptyMessage?: string
  alwaysShowSuggestions?: boolean
  getPillIcon?: (tag: Tag<T>) => React.ReactNode
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      'min-w-20 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
))

CommandInput.displayName = 'CommandInput'

export function TagInput<T>({
  tags,
  setTags,
  allTags = [],
  suggestionGroups,
  onSelectTag,
  onRemoveTag,
  onClearTags,
  getTagSearchValue,
  AllTagsLabel,
  placeholder = 'Add tag',
  className,
  pillClassName,
  emptyMessage = 'No tags found.',
  alwaysShowSuggestions = false,
  getPillIcon,
  ...props
}: TagInputProps<T>) {
  const container = React.useRef<HTMLDivElement>(null)
  const commandInput = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(alwaysShowSuggestions)
  const [inputValue, setInputValue] = React.useState('')
  const useGroupedSuggestions = suggestionGroups != null
  const showSuggestions = alwaysShowSuggestions || open

  useEffect(() => {
    if (alwaysShowSuggestions) return

    const handleClick = (event: MouseEvent) => {
      if (
        container.current &&
        !container.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [alwaysShowSuggestions])

  const resolveSearchValue = (tag: Tag<T>) =>
    getTagSearchValue?.(tag) ?? tag.label

  const handleBackSpace = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      const lastTag = tags[tags.length - 1]
      if (onRemoveTag) {
        onRemoveTag(lastTag)
      } else {
        setTags(tags.slice(0, tags.length - 1))
      }
    }
  }

  const handleValueChange = (value: string) => {
    setInputValue(value)
    setOpen(true)
  }

  const handleSelect = (selectedTag: Tag<T>) => {
    if (onSelectTag) {
      onSelectTag(selectedTag)
    } else if (!tags.some((tag) => tag.label === selectedTag.label)) {
      setTags([...tags, selectedTag])
    }
    setInputValue('')
    setOpen(true)
  }

  const handleRemove = (tagToRemove: Tag<T>) => {
    if (onRemoveTag) {
      onRemoveTag(tagToRemove)
    } else {
      setTags(tags.filter((tag) => tag.label !== tagToRemove.label))
    }
  }

  const handleClear = () => {
    if (inputValue !== '') {
      setInputValue('')
      return
    }

    if (onClearTags) {
      onClearTags()
    } else {
      setTags([])
    }
  }

  const filteredTags = allTags.filter(
    (tag) =>
      tag.label.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.some((selectedTag) => selectedTag.label === tag.label),
  )

  return (
    <div
      className={cn('flex w-full flex-col', className)}
      ref={container}
      {...props}
    >
      <Command
        shouldFilter={useGroupedSuggestions}
        className="rounded-md! border border-border bg-transparent p-0 shadow-none"
      >
        <div
          className="flex flex-col gap-2 p-2 hover:cursor-text"
          onClick={() => commandInput.current?.focus()}
        >
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Pill
                  key={tag.label}
                  label={tag.label}
                  icon={getPillIcon?.(tag)}
                  onRemove={() => handleRemove(tag)}
                  className={pillClassName}
                />
              ))}
            </div>
          ) : null}

          <div className="flex min-w-0 items-center gap-2">
            <CommandInput
              placeholder={placeholder}
              value={inputValue}
              onValueChange={handleValueChange}
              onKeyDown={handleBackSpace}
              onFocus={() => setOpen(true)}
              ref={commandInput}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                handleClear()
              }}
              className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Clear tags"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {showSuggestions ? (
          <CommandList className="max-h-64 w-full overflow-y-auto border-0 border-t border-border bg-popover p-0">
            <CommandEmpty className="px-4 py-6 text-sm text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            {useGroupedSuggestions ? (
              suggestionGroups.map((group) => (
                <CommandGroup
                  key={group.heading ?? group.tags[0]?.label ?? 'default'}
                  heading={group.heading}
                  className="p-0 **:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:text-muted-foreground"
                >
                  {group.tags.map((tag) => (
                    <CommandItem
                      key={resolveSearchValue(tag)}
                      value={resolveSearchValue(tag)}
                      disabled={group.isDisabled?.(tag)}
                      onSelect={() => handleSelect(tag)}
                      className={cn(
                        'cursor-pointer rounded-none px-4 py-3 data-selected:bg-accent data-selected:text-foreground [&_svg:last-child]:hidden',
                        group.isDisabled?.(tag) && 'opacity-50',
                      )}
                    >
                      {AllTagsLabel ? (
                        <AllTagsLabel value={tag.value} />
                      ) : (
                        tag.label
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {filteredTags.map((tag) => (
                  <CommandItem
                    key={tag.label}
                    value={tag.label}
                    onSelect={() => handleSelect(tag)}
                    className="cursor-pointer rounded-none px-4 py-3"
                  >
                    {AllTagsLabel ? (
                      <AllTagsLabel value={tag.value} />
                    ) : (
                      tag.label
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        ) : null}
      </Command>
    </div>
  )
}
