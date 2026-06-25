'use client'

import dayjs, { type Dayjs } from 'dayjs'
import { useTranslations } from 'next-intl'
import { ReactNode, useMemo } from 'react'

export const EXPENSE_DATE_GROUPS = {
  UPCOMING: 'upcoming',
  THIS_WEEK: 'thisWeek',
  EARLIER_THIS_MONTH: 'earlierThisMonth',
  LAST_MONTH: 'lastMonth',
  EARLIER_THIS_YEAR: 'earlierThisYear',
  LAST_YEAR: 'lastYear',
  OLDER: 'older',
} as const

export type ExpenseDateGroup =
  (typeof EXPENSE_DATE_GROUPS)[keyof typeof EXPENSE_DATE_GROUPS]

export function getExpenseDateGroup(
  date: Dayjs,
  today: Dayjs,
): ExpenseDateGroup {
  if (today.isBefore(date)) {
    return EXPENSE_DATE_GROUPS.UPCOMING
  } else if (today.isSame(date, 'week')) {
    return EXPENSE_DATE_GROUPS.THIS_WEEK
  } else if (today.isSame(date, 'month')) {
    return EXPENSE_DATE_GROUPS.EARLIER_THIS_MONTH
  } else if (today.subtract(1, 'month').isSame(date, 'month')) {
    return EXPENSE_DATE_GROUPS.LAST_MONTH
  } else if (today.isSame(date, 'year')) {
    return EXPENSE_DATE_GROUPS.EARLIER_THIS_YEAR
  } else if (today.subtract(1, 'year').isSame(date, 'year')) {
    return EXPENSE_DATE_GROUPS.LAST_YEAR
  } else {
    return EXPENSE_DATE_GROUPS.OLDER
  }
}

export function groupItemsByExpenseDate<T>(
  items: T[],
  getDate: (item: T) => Date | string,
): Partial<Record<ExpenseDateGroup, T[]>> {
  const today = dayjs()
  return items.reduce(
    (result: Partial<Record<ExpenseDateGroup, T[]>>, item) => {
      const expenseGroup = getExpenseDateGroup(dayjs(getDate(item)), today)
      result[expenseGroup] = result[expenseGroup] ?? []
      result[expenseGroup].push(item)
      return result
    },
    {},
  )
}

type GroupedExpenseCardsProps<T> = {
  items: T[]
  getDate: (item: T) => Date | string
  getKey: (item: T) => string
  renderCard: (item: T) => ReactNode
  renderBeforeCard?: (item: T) => ReactNode
}

export function GroupedExpenseCards<T>({
  items,
  getDate,
  getKey,
  renderCard,
  renderBeforeCard,
}: GroupedExpenseCardsProps<T>) {
  const t = useTranslations('Expenses')
  const groupedItems = useMemo(
    () => groupItemsByExpenseDate(items, getDate),
    [items, getDate],
  )

  return (
    <>
      {Object.values(EXPENSE_DATE_GROUPS).map((expenseGroup) => {
        const groupItems = groupedItems[expenseGroup]
        if (!groupItems || groupItems.length === 0) return null

        return (
          <div key={expenseGroup}>
            <div className="text-xs py-1 font-semibold sticky top-0 z-10 bg-background px-6">
              {t(`Groups.${expenseGroup}`)}
            </div>
            {groupItems.map((item) => (
              <div key={getKey(item)}>
                {renderBeforeCard?.(item)}
                {renderCard(item)}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
