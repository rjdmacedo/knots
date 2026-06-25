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

/**
 * Ranks expense titles by how often they appear (case-insensitive).
 * Uses the category from the first occurrence in the input order.
 */
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
