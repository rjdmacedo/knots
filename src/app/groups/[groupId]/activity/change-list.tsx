'use client'
import { Currency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { formatFieldValue, getFieldLabel } from './format-change-value'

const COLLAPSE_THRESHOLD = 3

interface ChangeListProps {
  changes: Array<{
    field: string
    oldValue: string | null
    newValue: string | null
  }>
  groupCurrency: Currency
  participants: Array<{ id: string; name: string }>
  categories: Array<{ id: number; grouping: string; name: string }>
  indented?: boolean
}

interface ChangeListItemProps {
  field: string
  oldValue: string | null
  newValue: string | null
  groupCurrency: Currency
  participants: Array<{ id: string; name: string }>
  categories: Array<{ id: number; grouping: string; name: string }>
}

function ChangeListItem({
  field,
  oldValue,
  newValue,
  groupCurrency,
  participants,
  categories,
}: ChangeListItemProps) {
  const t = useTranslations('Activity')
  const locale = useLocale()

  const context = {
    currency: groupCurrency,
    locale,
    participants,
    categories,
    t,
  }

  const label = getFieldLabel(field, t)
  const formattedOld = formatFieldValue(field, oldValue, context)
  const formattedNew = formatFieldValue(field, newValue, context)

  return (
    <li>
      {label}:{' '}
      {formattedOld !== null && (
        <>
          <span className="sr-only">from </span>
          {formattedOld}
        </>
      )}
      {formattedOld !== null && formattedNew !== null && ' → '}
      {formattedOld === null && formattedNew !== null && '→ '}
      {formattedOld !== null && formattedNew === null && ' →'}
      {formattedNew !== null && (
        <>
          <span className="sr-only"> to </span>
          {formattedNew}
        </>
      )}
    </li>
  )
}

export function ChangeList({
  changes,
  groupCurrency,
  participants,
  categories,
  indented = true,
}: ChangeListProps) {
  const t = useTranslations('Activity')

  const filteredChanges = changes.filter(
    (change) => change.oldValue !== null || change.newValue !== null,
  )

  const [isCollapsed, setIsCollapsed] = useState(
    filteredChanges.length > COLLAPSE_THRESHOLD,
  )

  if (filteredChanges.length === 0) {
    return null
  }

  const visibleChanges = isCollapsed
    ? filteredChanges.slice(0, COLLAPSE_THRESHOLD)
    : filteredChanges

  const hiddenCount = filteredChanges.length - COLLAPSE_THRESHOLD
  const showToggle = filteredChanges.length > COLLAPSE_THRESHOLD

  return (
    <div
      className={cn('text-xs text-muted-foreground mt-1', indented && 'pl-4')}
    >
      <ul
        aria-label={t('fieldChangesCount', { count: filteredChanges.length })}
      >
        {visibleChanges.map((change, index) => (
          <ChangeListItem
            key={`${change.field}-${index}`}
            field={change.field}
            oldValue={change.oldValue}
            newValue={change.newValue}
            groupCurrency={groupCurrency}
            participants={participants}
            categories={categories}
          />
        ))}
      </ul>
      {showToggle && (
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={(event) => {
            event.stopPropagation()
            setIsCollapsed(!isCollapsed)
          }}
        >
          {isCollapsed
            ? t('showMoreChanges', { count: hiddenCount })
            : t('showLess')}
        </button>
      )}
    </div>
  )
}
