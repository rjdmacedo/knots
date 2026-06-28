import { normalizeTitle } from '@/lib/category-mapping'
import { prisma } from '@/lib/prisma'

export type FrequentExpenseTitle = {
  title: string
  categoryId: number
}

type ExpenseTitleRecord = {
  title: string
  categoryId: number
}

export function rankFrequentExpenseTitles(
  expenses: ExpenseTitleRecord[],
  limit = 10,
): FrequentExpenseTitle[] {
  const counts = new Map<
    string,
    { count: number; categoryId: number; title: string }
  >()

  for (const expense of expenses) {
    const normalizedTitle = normalizeTitle(expense.title)
    if (normalizedTitle.length < 2) continue

    const existing = counts.get(normalizedTitle)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(normalizedTitle, {
        count: 1,
        categoryId: expense.categoryId,
        title: normalizedTitle,
      })
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ title, categoryId }) => ({ title, categoryId }))
}

export function titleMatchesQuery(
  title: string,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true
  return normalizeTitle(title).includes(normalizedQuery)
}

const RECENT_EXPENSES_SCAN_LIMIT = 500

export async function getFrequentExpenseTitlesForUser(
  userId: string,
  limit = 10,
): Promise<FrequentExpenseTitle[]> {
  const expenses = await prisma.expense.findMany({
    where: {
      paidById: userId,
      isReimbursement: false,
    },
    select: {
      title: true,
      categoryId: true,
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: RECENT_EXPENSES_SCAN_LIMIT,
  })

  return rankFrequentExpenseTitles(expenses, limit)
}

export async function getFrequentExpenseTitlesForGroup(
  groupId: string,
  limit = 10,
): Promise<FrequentExpenseTitle[]> {
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      isReimbursement: false,
    },
    select: {
      title: true,
      categoryId: true,
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: RECENT_EXPENSES_SCAN_LIMIT,
  })

  return rankFrequentExpenseTitles(expenses, limit)
}

export async function searchExpenseTitleSuggestions(
  groupId: string,
  normalizedQuery: string,
  limit = 10,
): Promise<FrequentExpenseTitle[]> {
  const [mappings, expenses] = await Promise.all([
    prisma.expenseCategoryMapping.findMany({
      where: {
        groupId,
        normalizedTitle: {
          contains: normalizedQuery,
        },
      },
      select: {
        normalizedTitle: true,
        categoryId: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    }),
    prisma.expense.findMany({
      where: {
        groupId,
        isReimbursement: false,
        title: {
          contains: normalizedQuery,
          mode: 'insensitive',
        },
      },
      select: {
        title: true,
        categoryId: true,
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: RECENT_EXPENSES_SCAN_LIMIT,
    }),
  ])

  const seen = new Set<string>()
  const results: FrequentExpenseTitle[] = []

  for (const mapping of mappings) {
    if (seen.has(mapping.normalizedTitle)) continue
    seen.add(mapping.normalizedTitle)
    results.push({
      title: mapping.normalizedTitle,
      categoryId: mapping.categoryId,
    })
    if (results.length >= limit) return results
  }

  const matchingExpenses = expenses.filter((expense) =>
    titleMatchesQuery(expense.title, normalizedQuery),
  )

  for (const suggestion of rankFrequentExpenseTitles(matchingExpenses, limit)) {
    const normalizedTitle = normalizeTitle(suggestion.title)
    if (seen.has(normalizedTitle)) continue
    seen.add(normalizedTitle)
    results.push(suggestion)
    if (results.length >= limit) break
  }

  return results
}
