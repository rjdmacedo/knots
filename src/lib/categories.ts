import type { Category } from '@prisma/client'

/** System category for payments/settlements — not selectable for regular expenses. */
export const PAYMENT_CATEGORY_ID = 1

export function isPaymentCategory(categoryId: number): boolean {
  return categoryId === PAYMENT_CATEGORY_ID
}

export function filterExpenseCategories(categories: Category[]): Category[] {
  return categories.filter((category) => !isPaymentCategory(category.id))
}
