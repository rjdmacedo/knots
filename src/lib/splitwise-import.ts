import { parseCSVLine } from '@/lib/csv-parse'
import { findMatchingParticipant } from '@/lib/participant-matching'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues } from '@/lib/schemas'
import { SplitMode } from '@prisma/client'

const SPLITWISE_STANDARD_COLUMNS = [
  'Date',
  'Description',
  'Category',
  'Cost',
  'Currency',
]

export type SplitwiseCsvStructure = {
  headers: string[]
  userColumns: string[]
  dataRowCount: number
}

export type SplitwiseCsvParticipant = {
  csvName: string
  expenseCount: number
  suggestedUserId: string | null
  suggestedMemberName: string | null
}

export type SplitwiseImportAnalysis = {
  expenseCount: number
  csvParticipants: SplitwiseCsvParticipant[]
}

export type SplitwiseParseOptions = {
  /** Maps Splitwise CSV column names to group user IDs */
  csvNameToUserId?: Record<string, string>
  requireAllMapped?: boolean
}

export function parseSplitwiseCsvStructure(
  csvContent: string,
): SplitwiseCsvStructure {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row')
  }

  const headers = parseCSVLine(lines[0]).map((header) =>
    header.trim().replace(/\r/g, ''),
  )
  const userColumns = headers.filter(
    (header) => !SPLITWISE_STANDARD_COLUMNS.includes(header),
  )

  if (userColumns.length === 0) {
    throw new Error('No user columns found in CSV')
  }

  let dataRowCount = 0
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const row = parseCSVLine(line)
    if (!isTotalRow(row, headers)) {
      dataRowCount++
    }
  }

  return { headers, userColumns, dataRowCount }
}

/**
 * Analyzes Splitwise CSV column names against group members (fuzzy name match).
 */
export async function analyzeSplitwiseImport(
  csvContent: string,
  groupId: string,
): Promise<SplitwiseImportAnalysis> {
  const { headers, userColumns, dataRowCount } =
    parseSplitwiseCsvStructure(csvContent)

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  if (!group) {
    throw new Error('Group not found')
  }

  const targetMembers = group.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }))

  const expenseCounts = countCsvNameReferences(csvContent, headers, userColumns)

  const csvParticipants = userColumns.map((csvName) => {
    const member = findMatchingParticipant(csvName, targetMembers)
    return {
      csvName,
      expenseCount: expenseCounts.get(csvName) ?? 0,
      suggestedUserId: member?.id ?? null,
      suggestedMemberName: member?.name ?? null,
    }
  })

  return {
    expenseCount: dataRowCount,
    csvParticipants,
  }
}

function countCsvNameReferences(
  csvContent: string,
  headers: string[],
  userColumns: string[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const name of userColumns) {
    counts.set(name, 0)
  }

  const lines = csvContent.trim().split('\n')
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const row = parseCSVLine(line)
    if (isTotalRow(row, headers)) continue

    for (const csvName of userColumns) {
      const columnIndex = headers.indexOf(csvName)
      if (columnIndex < 0) continue
      const amount = parseFloat(row[columnIndex]) || 0
      if (amount !== 0) {
        counts.set(csvName, (counts.get(csvName) ?? 0) + 1)
      }
    }
  }

  return counts
}

/**
 * Parses Splitwise CSV and converts rows to Knots expense form values.
 */
export async function parseSplitwiseCSV(
  csvContent: string,
  groupId: string,
  options?: SplitwiseParseOptions,
): Promise<ExpenseFormValues[]> {
  const requireAllMapped = options?.requireAllMapped ?? true
  const { headers, userColumns } = parseSplitwiseCsvStructure(csvContent)
  const lines = csvContent.trim().split('\n')
  const dataRows = lines.slice(1).map((line) => parseCSVLine(line))

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  if (!group) {
    throw new Error('Group not found')
  }

  const participants = group.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }))

  const categories = await prisma.category.findMany()
  const categoryMap = new Map<string, number>()
  for (const cat of categories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id)
  }

  const resolveCsvName = buildCsvNameResolver(
    userColumns,
    participants,
    options?.csvNameToUserId ?? {},
  )

  if (requireAllMapped) {
    const unmapped = userColumns.filter((name) => {
      try {
        resolveCsvName(name)
        return false
      } catch {
        return true
      }
    })
    if (unmapped.length > 0) {
      throw new Error(
        `These Splitwise names are not mapped to group members: ${unmapped.join(', ')}.`,
      )
    }
  }

  const expenses: ExpenseFormValues[] = []

  for (const row of dataRows) {
    if (isTotalRow(row, headers)) {
      continue
    }

    try {
      const expense = await parseExpenseRow(
        row,
        headers,
        userColumns,
        resolveCsvName,
        categoryMap,
      )
      expenses.push(expense)
    } catch (error) {
      console.warn(`Failed to parse expense row: ${error}`)
    }
  }

  return expenses
}

function buildCsvNameResolver(
  userColumns: string[],
  participants: Array<{ id: string; name: string }>,
  explicitMap: Record<string, string>,
) {
  const cache = new Map<string, string>()

  return (csvName: string): string => {
    const cached = cache.get(csvName)
    if (cached) return cached

    const explicitUserId = explicitMap[csvName]
    if (explicitUserId) {
      const member = participants.find((p) => p.id === explicitUserId)
      if (!member) {
        throw new Error(
          `Mapped user not in group for Splitwise name "${csvName}"`,
        )
      }
      cache.set(csvName, explicitUserId)
      return explicitUserId
    }

    const match = findMatchingParticipant(csvName, participants)
    if (!match) {
      throw new Error(`No group member mapped for Splitwise name "${csvName}"`)
    }

    cache.set(csvName, match.id)
    return match.id
  }
}

function isTotalRow(row: string[], headers: string[]): boolean {
  const descriptionIndex = headers.indexOf('Description')
  if (descriptionIndex >= 0) {
    const description = (row[descriptionIndex] || '').trim().toLowerCase()
    return (
      description === '' ||
      description.includes('total') ||
      description.includes('balance')
    )
  }

  const costIndex = headers.indexOf('Cost')
  if (costIndex >= 0) {
    const cost = (row[costIndex] || '').trim()
    if (cost === '' || cost === ' ') {
      return true
    }
  }

  return false
}

async function parseExpenseRow(
  row: string[],
  headers: string[],
  userColumns: string[],
  resolveCsvName: (csvName: string) => string,
  categoryMap: Map<string, number>,
): Promise<ExpenseFormValues> {
  const dateIndex = headers.indexOf('Date')
  const descriptionIndex = headers.indexOf('Description')
  const categoryIndex = headers.indexOf('Category')
  const costIndex = headers.indexOf('Cost')

  if (dateIndex === -1 || descriptionIndex === -1 || costIndex === -1) {
    throw new Error('Required columns (Date, Description, Cost) not found')
  }

  const dateStr = row[dateIndex]
  const description = row[descriptionIndex]
  const categoryName = categoryIndex >= 0 ? row[categoryIndex] : ''
  const costStr = row[costIndex]

  const expenseDate = new Date(dateStr)
  if (isNaN(expenseDate.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }

  const cost = parseFloat(costStr)
  if (isNaN(cost)) {
    throw new Error(`Invalid cost: ${costStr}`)
  }
  const costInCents = Math.round(cost * 100)

  const categoryId = categoryName
    ? categoryMap.get(categoryName.toLowerCase()) || 0
    : 0

  const userAmounts = new Map<string, number>()
  let paidByCsvName = ''
  let maxAmount = -Infinity

  for (const userColumn of userColumns) {
    const userIndex = headers.indexOf(userColumn)
    if (userIndex >= 0) {
      const amount = parseFloat(row[userIndex]) || 0
      const amountInCents = Math.round(amount * 100)
      userAmounts.set(userColumn, amountInCents)

      if (amountInCents > maxAmount) {
        maxAmount = amountInCents
        paidByCsvName = userColumn
      }
    }
  }

  if (!paidByCsvName) {
    throw new Error('Could not determine who paid for this expense')
  }

  const paidBy = resolveCsvName(paidByCsvName)

  const paidFor: Array<{ participant: string; shares: number }> = []

  userAmounts.forEach((amount, csvName) => {
    if (amount !== 0) {
      const participant = resolveCsvName(csvName)
      const totalExpense = costInCents
      const userShare = amount > 0 ? totalExpense - amount : Math.abs(amount)

      paidFor.push({
        participant,
        shares: userShare,
      })
    }
  })

  if (paidFor.length === 0) {
    throw new Error('No valid participants found for this expense')
  }

  const shares = paidFor.map((p) => p.shares)
  const allSharesEqual = shares.every((share) => share === shares[0])
  const splitMode = allSharesEqual ? 'EVENLY' : 'BY_AMOUNT'

  const isReimbursement = categoryName?.toLowerCase() === 'payment'

  return {
    expenseDate,
    title: description,
    category: categoryId,
    amount: costInCents,
    paidBy,
    paidFor,
    splitMode: splitMode as SplitMode,
    saveDefaultSplittingOptions: false,
    isReimbursement,
    documents: [],
    notes: `Imported from Splitwise`,
    recurrenceRule: 'NONE' as const,
  }
}
