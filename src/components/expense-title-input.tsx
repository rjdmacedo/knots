'use client'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useEffect, useRef, useState } from 'react'

export interface ExpenseTitleSuggestion {
  title: string
  categoryId: number
}

interface ExpenseTitleInputProps {
  groupId: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  onSuggestionSelected: (suggestion: ExpenseTitleSuggestion) => void
  placeholder?: string
  className?: string
}

export function ExpenseTitleInput({
  groupId,
  value,
  onChange,
  onBlur,
  onSuggestionSelected,
  placeholder,
  className,
}: ExpenseTitleInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false)

  const debouncedQuery = useDebouncedValue(value, 300)

  const { data } = trpc.groups.expenses.suggestTitles.useQuery(
    { groupId, query: debouncedQuery },
    {
      enabled: isOpen,
    },
  )

  const suggestions = data?.suggestions ?? []
  const filteredSuggestions = suggestions.filter(
    (s) => s.title !== value.toLowerCase().trim(),
  )

  const showSuggestions = isOpen && filteredSuggestions.length > 0

  const selectSuggestion = (suggestion: ExpenseTitleSuggestion) => {
    isSelectingRef.current = true
    // Capitalize the first letter for display
    const displayTitle =
      suggestion.title.charAt(0).toUpperCase() + suggestion.title.slice(1)
    onChange(displayTitle)
    onSuggestionSelected(suggestion)
    setIsOpen(false)
    setTimeout(() => {
      isSelectingRef.current = false
    }, 0)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't trigger blur if clicking a suggestion inside the container
    if (
      containerRef.current?.contains(e.relatedTarget as Node) ||
      isSelectingRef.current
    ) {
      return
    }
    setIsOpen(false)
    onBlur()
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => {
          setIsOpen(true)
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(className)}
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls="expense-title-suggestions"
        autoComplete="off"
      />
      {showSuggestions && (
        <div className="absolute z-50 mt-1 w-full">
          <Command className="rounded-md border border-input shadow-md">
            <CommandList>
              <CommandEmpty>No suggestions found.</CommandEmpty>
              <CommandGroup>
                {filteredSuggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.title}
                    value={suggestion.title}
                    onSelect={() => selectSuggestion(suggestion)}
                    className="capitalize"
                  >
                    <HighlightMatch text={suggestion.title} query={value} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}

/** Highlights the matching prefix in the suggestion text */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery || !text.toLowerCase().startsWith(normalizedQuery)) {
    return <span>{text}</span>
  }

  return (
    <span>
      <span className="font-medium">
        {text.slice(0, normalizedQuery.length)}
      </span>
      {text.slice(normalizedQuery.length)}
    </span>
  )
}

/** Simple debounce hook */
function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
