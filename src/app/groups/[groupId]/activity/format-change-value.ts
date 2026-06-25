import { Currency } from '@/lib/currency'
import { formatCurrency, formatDate } from '@/lib/utils'

const KNOWN_FIELDS = [
  'title',
  'amount',
  'expenseDate',
  'category',
  'paidBy',
  'splitMode',
  'isReimbursement',
  'notes',
  'recurrenceRule',
  'paidFor',
  'name',
  'information',
  'currency',
  'participants',
] as const

/**
 * Maps a raw field name to a human-readable, localized label.
 * Unknown fields are returned as-is.
 */
export function getFieldLabel(
  field: string,
  t: (key: string) => string,
): string {
  if ((KNOWN_FIELDS as readonly string[]).includes(field)) {
    return t(`fieldLabels.${field}`)
  }
  return field
}

/**
 * Formats a raw field value into a human-readable string based on the field type.
 * Returns null if the input value is null.
 */
export function formatFieldValue(
  field: string,
  value: string | null,
  context: {
    currency: Currency
    locale: string
    participants: Array<{ id: string; name: string }>
    categories: Array<{ id: number; grouping: string; name: string }>
    t: (key: string) => string
  },
): string | null {
  if (value === null) {
    return null
  }

  switch (field) {
    case 'amount':
      return formatAmount(value, context.currency, context.locale)

    case 'expenseDate':
      return formatExpenseDate(value, context.locale)

    case 'isReimbursement':
      return formatBoolean(value, context.t)

    case 'paidBy':
      return resolveParticipantName(value, context.participants)

    case 'paidFor':
      return formatPaidFor(value, context.participants)

    case 'category':
      return formatCategory(value, context.categories)

    default:
      return value
  }
}

function formatAmount(
  value: string,
  currency: Currency,
  locale: string,
): string {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) {
    return value
  }
  return formatCurrency(currency, parsed, locale)
}

function formatExpenseDate(value: string, locale: string): string {
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    return value
  }
  return formatDate(date, locale, { dateStyle: 'medium' })
}

function formatBoolean(value: string, t: (key: string) => string): string {
  if (value === 'true') {
    return t('yes')
  }
  if (value === 'false') {
    return t('no')
  }
  return value
}

function resolveParticipantName(
  id: string,
  participants: Array<{ id: string; name: string }>,
): string {
  const participant = participants.find((p) => p.id === id)
  return participant ? participant.name : id
}

function formatPaidFor(
  value: string,
  participants: Array<{ id: string; name: string }>,
): string {
  try {
    const ids: unknown = JSON.parse(value)
    if (!Array.isArray(ids)) {
      return value
    }
    return ids
      .map((id) => resolveParticipantName(String(id), participants))
      .join(', ')
  } catch {
    return value
  }
}

function formatCategory(
  value: string,
  categories: Array<{ id: number; grouping: string; name: string }>,
): string {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) {
    return value
  }
  const category = categories.find((c) => c.id === parsed)
  return category ? `${category.grouping}/${category.name}` : value
}
