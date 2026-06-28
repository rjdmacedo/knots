'use client'

import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { keepPreviousData } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react'

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

const DIRECT_GROUP_ID = 'direct'
const SUGGESTIONS_LIMIT = 10
const QUERY_DEBOUNCE_MS = 250

type InputPassthroughProps = Omit<
  ComponentProps<'input'>,
  | 'value'
  | 'onChange'
  | 'onBlur'
  | 'onFocus'
  | 'onKeyDown'
  | 'placeholder'
  | 'className'
  | 'ref'
>

export function ExpenseTitleInput({
  groupId,
  value,
  onChange,
  onBlur,
  onSuggestionSelected,
  placeholder,
  className,
  ...inputProps
}: ExpenseTitleInputProps & InputPassthroughProps) {
  if (groupId === DIRECT_GROUP_ID) {
    return (
      <Input
        {...inputProps}
        className={cn('text-base', className)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
      />
    )
  }

  return (
    <ExpenseTitleSuggestionsInput
      key={groupId}
      groupId={groupId}
      initialValue={value}
      onChange={onChange}
      onBlur={onBlur}
      onSuggestionSelected={onSuggestionSelected}
      placeholder={placeholder}
      className={className}
      inputProps={inputProps}
    />
  )
}

function ExpenseTitleSuggestionsInput({
  groupId,
  initialValue,
  onChange,
  onBlur,
  onSuggestionSelected,
  placeholder,
  className,
  inputProps,
}: Omit<ExpenseTitleInputProps, 'value'> & {
  initialValue: string
  inputProps: InputPassthroughProps
}) {
  const t = useTranslations('ExpenseTitleInput')
  const fallbackId = useId()
  const listboxId = `${inputProps.id ?? fallbackId}-listbox`
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [inputText, setInputText] = useState(initialValue)
  const isSelectingRef = useRef(false)

  const query = normalizeTitle(inputText)
  const debouncedQuery = useDebouncedValue(query, QUERY_DEBOUNCE_MS)
  const isQueryPending = debouncedQuery !== query

  const { data, isFetching } = trpc.groups.expenses.suggestTitles.useQuery(
    { groupId, query: debouncedQuery },
    {
      enabled: focused,
      placeholderData: keepPreviousData,
    },
  )

  const isLoadingSuggestions = focused && (isQueryPending || isFetching)

  const nextSuggestions = useMemo(() => {
    return (data?.suggestions ?? []).slice(0, SUGGESTIONS_LIMIT)
  }, [data?.suggestions])

  const stableSuggestionsRef = useRef<ExpenseTitleSuggestion[]>([])

  if (!isLoadingSuggestions) {
    stableSuggestionsRef.current = nextSuggestions
  }

  const suggestions = isLoadingSuggestions
    ? stableSuggestionsRef.current
    : nextSuggestions

  const showSuggestions = open && focused && suggestions.length > 0

  useEffect(() => {
    if (!showSuggestions) {
      setHighlightedIndex(-1)
      return
    }

    setHighlightedIndex((current) => {
      if (current >= 0 && current < suggestions.length) return current
      return 0
    })
  }, [showSuggestions, suggestions])

  const handleInputChange = (next: string) => {
    setInputText(next)
    onChange(next)
    setOpen(true)
  }

  const selectSuggestion = (suggestion: ExpenseTitleSuggestion) => {
    isSelectingRef.current = true
    const displayTitle =
      suggestion.title.charAt(0).toUpperCase() + suggestion.title.slice(1)
    setInputText(displayTitle)
    onChange(displayTitle)
    onSuggestionSelected(suggestion)
    setOpen(false)
    setHighlightedIndex(-1)
    requestAnimationFrame(() => {
      isSelectingRef.current = false
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (event.key === 'ArrowDown' && suggestions.length > 0) {
        event.preventDefault()
        setOpen(true)
        setHighlightedIndex(0)
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex((current) =>
          current < suggestions.length - 1 ? current + 1 : 0,
        )
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex((current) =>
          current > 0 ? current - 1 : suggestions.length - 1,
        )
        break
      case 'Enter':
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          event.preventDefault()
          selectSuggestion(suggestions[highlightedIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  return (
    <div className="relative w-full">
      <InputGroup className="w-full">
        <InputGroupInput
          {...inputProps}
          className={cn('text-base', className)}
          value={inputText}
          onChange={(event) => {
            handleInputChange(event.target.value)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true)
            setOpen(true)
          }}
          onBlur={() => {
            setFocused(false)
            setOpen(false)
            if (!isSelectingRef.current) {
              onBlur()
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          aria-busy={isLoadingSuggestions}
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-activedescendant={
            showSuggestions && highlightedIndex >= 0
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          role="combobox"
        />
        {isLoadingSuggestions ? (
          <InputGroupAddon align="inline-end" className="pointer-events-none">
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground opacity-50" />
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {showSuggestions ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-100 mt-1 max-h-72 w-full overflow-y-auto overscroll-contain rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.title} role="presentation">
              <button
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  'flex w-full min-w-0 cursor-default rounded-sm px-2 py-1.5 text-start text-sm outline-hidden select-none',
                  index === highlightedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(index)
                }}
                onClick={() => {
                  selectSuggestion(suggestion)
                }}
              >
                <span className="truncate">
                  <HighlightMatch text={suggestion.title} query={query} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!showSuggestions && open && focused && suggestions.length === 0 ? (
        <p className="sr-only">{t('noSuggestions')}</p>
      ) : null}
    </div>
  )
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ')
}

function formatTitleForDisplay(title: string): string {
  if (!title) return title
  return title.charAt(0).toUpperCase() + title.slice(1)
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const displayText = formatTitleForDisplay(text)
  const normalizedText = normalizeTitle(text)
  const index = query ? normalizedText.indexOf(query) : -1

  if (index === -1) {
    return <span>{displayText}</span>
  }

  return (
    <span>
      {displayText.slice(0, index)}
      <span className="font-medium">
        {displayText.slice(index, index + query.length)}
      </span>
      {displayText.slice(index + query.length)}
    </span>
  )
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
