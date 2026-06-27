type TrendExpense = {
  amount: number
  expenseDate: Date
  isReimbursement: boolean
  categoryId: number
}

export type TrendMonth = {
  year: number
  month: number
  amount: number
}

export function computeRecentCategoryTrends(
  expenses: TrendExpense[],
  options: {
    categoryId: number
    referenceDate: Date
    monthCount?: number
  },
): TrendMonth[] {
  const monthCount = options.monthCount ?? 3
  const reference = new Date(options.referenceDate)
  const endYear = reference.getFullYear()
  const endMonth = reference.getMonth()

  const months: TrendMonth[] = []
  for (let offset = monthCount - 1; offset >= 0; offset--) {
    const date = new Date(endYear, endMonth - offset, 1)
    months.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      amount: 0,
    })
  }

  for (const expense of expenses) {
    if (expense.isReimbursement || expense.categoryId !== options.categoryId) {
      continue
    }

    const expenseDate = new Date(expense.expenseDate)
    const bucket = months.find(
      (month) =>
        month.year === expenseDate.getFullYear() &&
        month.month === expenseDate.getMonth(),
    )

    if (bucket) {
      bucket.amount += expense.amount
    }
  }

  return months
}
