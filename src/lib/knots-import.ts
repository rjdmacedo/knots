import { parseCSVLine } from '@/lib/csv-parse'
import { findMatchingParticipant } from '@/lib/participant-matching'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues } from '@/lib/schemas'
import { RecurrenceRule, SplitMode } from '@prisma/client'
import { z } from 'zod'

const knotsExportExpenseSchema = z.object({
  expenseDate: z.string(),
  title: z.string(),
  category: z
    .object({
      grouping: z.string().optional(),
      name: z.string(),
    })
    .optional()
    .nullable(),
  amount: z.number().int(),
  originalAmount: z.number().int().nullable().optional(),
  originalCurrency: z.string().nullable().optional(),
  conversionRate: z.union([z.number(), z.string()]).nullable().optional(),
  paidById: z.string(),
  paidFor: z.array(
    z.object({
      userId: z.string(),
      shares: z.number(),
    }),
  ),
  isReimbursement: z.boolean().default(false),
  splitMode: z.enum(['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT']),
  recurrenceRule: z
    .enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
    .optional()
    .default('NONE'),
  notes: z.string().optional(),
})

const knotsExportSchema = z.object({
  participants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  expenses: z.array(knotsExportExpenseSchema),
})

export type KnotsExport = z.infer<typeof knotsExportSchema>

export type KnotsImportAnalysis = {
  expenseCount: number
  matchedParticipants: Array<{ exportName: string; memberName: string }>
  missingParticipants: Array<{ exportName: string; expenseCount: number }>
}

export function parseKnotsExportFile(fileContent: string): KnotsExport {
  const trimmed = fileContent.trim().replace(/^\uFEFF/, '')

  return trimmed.startsWith('{')
    ? parseKnotsJSON(trimmed)
    : parseKnotsCSV(trimmed)
}

/**
 * Analyzes a Knots export against the target group's members.
 */
export async function analyzeKnotsImport(
  fileContent: string,
  groupId: string,
): Promise<KnotsImportAnalysis> {
  const exportData = parseKnotsExportFile(fileContent)

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

  const exportParticipantNames = new Map(
    exportData.participants.map((p) => [p.id, p.name]),
  )

  const { matched, missingWithCounts } = buildParticipantMatchReport(
    exportData,
    exportParticipantNames,
    targetMembers,
  )

  return {
    expenseCount: exportData.expenses.length,
    matchedParticipants: matched,
    missingParticipants: missingWithCounts,
  }
}

const KNOTS_CSV_STANDARD_COLUMNS = [
  'Date',
  'Description',
  'Category',
  'Currency',
  'Cost',
  'Original cost',
  'Original currency',
  'Conversion rate',
  'Is Reimbursement',
  'Split mode',
]

const SPLIT_MODE_FROM_LABEL: Record<string, SplitMode> = {
  Evenly: 'EVENLY',
  'Unevenly – By shares': 'BY_SHARES',
  'Unevenly - By shares': 'BY_SHARES',
  'Unevenly – By percentage': 'BY_PERCENTAGE',
  'Unevenly - By percentage': 'BY_PERCENTAGE',
  'Unevenly – By amount': 'BY_AMOUNT',
  'Unevenly - By amount': 'BY_AMOUNT',
}

/**
 * Parses Knots JSON or CSV export and converts it to expense form values for the
 * target group. Participant IDs from the export are mapped to group members by name.
 */
export async function parseKnotsExport(
  fileContent: string,
  groupId: string,
  options?: { requireAllMembers?: boolean },
): Promise<ExpenseFormValues[]> {
  const requireAllMembers = options?.requireAllMembers ?? true
  const exportData = parseKnotsExportFile(fileContent)

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

  if (targetMembers.length === 0) {
    throw new Error('Group has no members')
  }

  const categories = await prisma.category.findMany()
  const categoryMap = new Map<string, number>()
  for (const cat of categories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id)
  }

  const exportParticipantNames = new Map(
    exportData.participants.map((p) => [p.id, p.name]),
  )

  const missingParticipants = findMissingExportParticipants(
    exportData,
    exportParticipantNames,
    targetMembers,
  )
  if (requireAllMembers && missingParticipants.length > 0) {
    throw new Error(
      `These export participants are not in the group: ${missingParticipants.join(', ')}.`,
    )
  }

  const participantIdCache = new Map<string, string>()

  const mapParticipantId = (exportParticipantId: string): string => {
    const cached = participantIdCache.get(exportParticipantId)
    if (cached) return cached

    const name = exportParticipantNames.get(exportParticipantId)
    if (!name) {
      throw new Error(
        `Unknown participant ID in export: ${exportParticipantId}`,
      )
    }

    const match = findMatchingParticipant(name, targetMembers)
    if (!match) {
      throw new Error(
        `No group member matches export participant "${name}". Add them to the group or adjust the export.`,
      )
    }

    participantIdCache.set(exportParticipantId, match.id)
    return match.id
  }

  return exportData.expenses.map((expense, index) =>
    convertExportExpense(expense, index, mapParticipantId, categoryMap),
  )
}

function buildParticipantMatchReport(
  exportData: KnotsExport,
  exportParticipantNames: Map<string, string>,
  targetMembers: Array<{ id: string; name: string }>,
) {
  const matched: KnotsImportAnalysis['matchedParticipants'] = []
  const missingCounts = new Map<string, number>()
  const matchedExportNames = new Set<string>()

  for (const expense of exportData.expenses) {
    const participantIds = new Set<string>([expense.paidById])
    for (const entry of expense.paidFor) {
      participantIds.add(entry.userId)
    }

    for (const exportParticipantId of Array.from(participantIds)) {
      const exportName = exportParticipantNames.get(exportParticipantId)
      if (!exportName) continue

      const member = findMatchingParticipant(exportName, targetMembers)
      if (member) {
        if (!matchedExportNames.has(exportName)) {
          matchedExportNames.add(exportName)
          matched.push({ exportName, memberName: member.name })
        }
        continue
      }

      missingCounts.set(exportName, (missingCounts.get(exportName) ?? 0) + 1)
    }
  }

  const missingWithCounts = Array.from(missingCounts.entries())
    .map(([exportName, expenseCount]) => ({ exportName, expenseCount }))
    .sort((a, b) => a.exportName.localeCompare(b.exportName))

  return { matched, missingWithCounts }
}

function collectReferencedParticipantIds(exportData: KnotsExport): Set<string> {
  const referencedIds = new Set<string>()

  for (const expense of exportData.expenses) {
    referencedIds.add(expense.paidById)
    for (const entry of expense.paidFor) {
      referencedIds.add(entry.userId)
    }
  }

  return referencedIds
}

function findMissingExportParticipants(
  exportData: KnotsExport,
  exportParticipantNames: Map<string, string>,
  targetMembers: Array<{ id: string; name: string }>,
): string[] {
  const referencedIds = collectReferencedParticipantIds(exportData)

  const missing = new Set<string>()
  for (const exportParticipantId of Array.from(referencedIds)) {
    const name = exportParticipantNames.get(exportParticipantId)
    if (!name) {
      missing.add(`unknown ID ${exportParticipantId}`)
      continue
    }

    if (!findMatchingParticipant(name, targetMembers)) {
      missing.add(name)
    }
  }

  return Array.from(missing).sort()
}

function parseKnotsJSON(content: string): KnotsExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Invalid JSON file')
  }

  const result = knotsExportSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid Knots export format: ${result.error.issues[0]?.message ?? 'unknown error'}`,
    )
  }

  if (result.data.expenses.length === 0) {
    throw new Error('Export contains no expenses')
  }

  return result.data
}

function parseKnotsCSV(content: string): KnotsExport {
  const lines = content.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row')
  }

  const headers = parseCSVLine(lines[0]).map((header) => header.trim())
  const participantNames = headers.filter(
    (header) => !KNOTS_CSV_STANDARD_COLUMNS.includes(header),
  )

  if (participantNames.length === 0) {
    throw new Error('No participant columns found in Knots CSV export')
  }

  const participants = participantNames.map((name, index) => ({
    id: `csv-participant-${index}`,
    name,
  }))
  const participantIdByName = new Map(participants.map((p) => [p.name, p.id]))

  const expenses: z.infer<typeof knotsExportExpenseSchema>[] = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue

    const row = parseCSVLine(line)
    const description = row[headers.indexOf('Description')]?.trim() ?? ''
    if (!description || description.toLowerCase().includes('total')) {
      continue
    }

    const costStr = row[headers.indexOf('Cost')]?.trim()
    const cost = parseFloat(costStr ?? '')
    if (Number.isNaN(cost)) continue

    const amountInCents = Math.round(cost * 100)
    const splitModeLabel =
      row[headers.indexOf('Split mode')]?.trim() ?? 'Evenly'
    const splitMode = SPLIT_MODE_FROM_LABEL[splitModeLabel] ?? 'EVENLY'

    const participantAmounts = new Map<string, number>()
    let paidByName = ''
    let maxAmount = -Infinity

    for (const participantName of participantNames) {
      const columnIndex = headers.indexOf(participantName)
      if (columnIndex < 0) continue

      const amount = parseFloat(row[columnIndex]) || 0
      const amountInCents = Math.round(amount * 100)
      participantAmounts.set(participantName, amountInCents)

      if (amountInCents > maxAmount) {
        maxAmount = amountInCents
        paidByName = participantName
      }
    }

    if (!paidByName) {
      continue
    }

    const paidFor = buildPaidForFromAmounts(
      participantAmounts,
      amountInCents,
      splitMode,
      participantIdByName,
    )

    if (paidFor.length === 0) continue

    const categoryName = row[headers.indexOf('Category')]?.trim() ?? ''
    const originalCostStr = row[headers.indexOf('Original cost')]?.trim()
    const originalAmount =
      originalCostStr && originalCostStr !== ''
        ? Math.round(parseFloat(originalCostStr) * 100)
        : null
    const originalCurrency =
      row[headers.indexOf('Original currency')]?.trim() || null
    const conversionRateStr = row[headers.indexOf('Conversion rate')]?.trim()
    const conversionRate =
      conversionRateStr && conversionRateStr !== '' ? conversionRateStr : null
    const isReimbursement = (
      row[headers.indexOf('Is Reimbursement')]?.trim() ?? ''
    )
      .toLowerCase()
      .startsWith('y')

    expenses.push({
      expenseDate: row[headers.indexOf('Date')]?.trim() ?? '',
      title: description,
      category: categoryName ? { name: categoryName } : undefined,
      amount: amountInCents,
      originalAmount:
        originalAmount !== null && !Number.isNaN(originalAmount)
          ? originalAmount
          : null,
      originalCurrency,
      conversionRate,
      paidById: participantIdByName.get(paidByName)!,
      paidFor,
      isReimbursement,
      splitMode,
      recurrenceRule: 'NONE',
    })
  }

  if (expenses.length === 0) {
    throw new Error('No expenses found in Knots CSV export')
  }

  return { participants, expenses }
}

function buildPaidForFromAmounts(
  participantAmounts: Map<string, number>,
  amountInCents: number,
  splitMode: SplitMode,
  participantIdByName: Map<string, string>,
): Array<{ userId: string; shares: number }> {
  const entries = Array.from(participantAmounts.entries()).filter(
    ([, amount]) => amount !== 0,
  )

  if (entries.length === 0) {
    return []
  }

  if (splitMode === 'EVENLY') {
    const share = Math.round(amountInCents / entries.length)
    return entries.map(([name]) => ({
      userId: participantIdByName.get(name)!,
      shares: share,
    }))
  }

  if (splitMode === 'BY_AMOUNT') {
    return entries.map(([name, amount]) => ({
      userId: participantIdByName.get(name)!,
      shares: amount > 0 ? amountInCents - amount : Math.abs(amount),
    }))
  }

  const totalAbs = entries.reduce(
    (sum, [, amount]) => sum + Math.abs(amount),
    0,
  )
  if (totalAbs === 0) {
    return []
  }

  if (splitMode === 'BY_PERCENTAGE') {
    return entries.map(([name, amount]) => ({
      userId: participantIdByName.get(name)!,
      shares: Math.round((Math.abs(amount) / totalAbs) * 10000),
    }))
  }

  // BY_SHARES — derive relative share counts from exported amounts
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const rawShares = entries.map(([, amount]) => Math.abs(amount))
  const divisor = rawShares.reduce(gcd)
  return entries.map(([name], index) => ({
    userId: participantIdByName.get(name)!,
    shares: Math.max(1, Math.round(rawShares[index] / (divisor || 1))),
  }))
}

function convertExportExpense(
  expense: z.infer<typeof knotsExportExpenseSchema>,
  index: number,
  mapParticipantId: (exportParticipantId: string) => string,
  categoryMap: Map<string, number>,
): ExpenseFormValues {
  const expenseDate = new Date(expense.expenseDate)
  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error(`Invalid expense date on row ${index + 1}`)
  }

  let paidBy: string
  try {
    paidBy = mapParticipantId(expense.paidById)
  } catch (error) {
    throw new Error(
      `Expense "${expense.title}" (row ${index + 1}): ${error instanceof Error ? error.message : error}`,
    )
  }

  const paidForMap = new Map<string, number>()
  for (const entry of expense.paidFor) {
    let userId: string
    try {
      userId = mapParticipantId(entry.userId)
    } catch (error) {
      throw new Error(
        `Expense "${expense.title}" (row ${index + 1}): ${error instanceof Error ? error.message : error}`,
      )
    }
    paidForMap.set(userId, (paidForMap.get(userId) ?? 0) + entry.shares)
  }

  const paidFor = Array.from(paidForMap.entries()).map(
    ([participant, shares]) => ({
      participant,
      shares,
    }),
  )

  if (paidFor.length === 0) {
    throw new Error(
      `Expense "${expense.title}" (row ${index + 1}) has no valid participants`,
    )
  }

  const categoryName = expense.category?.name ?? ''
  const conversionRate =
    expense.conversionRate === null || expense.conversionRate === undefined
      ? undefined
      : Number(expense.conversionRate)

  return {
    expenseDate,
    title: expense.title,
    category: categoryName
      ? (categoryMap.get(categoryName.toLowerCase()) ?? 0)
      : 0,
    amount: expense.amount,
    originalAmount: expense.originalAmount ?? undefined,
    originalCurrency: expense.originalCurrency ?? undefined,
    conversionRate: Number.isNaN(conversionRate) ? undefined : conversionRate,
    paidBy,
    paidFor,
    splitMode: expense.splitMode as SplitMode,
    saveDefaultSplittingOptions: false,
    isReimbursement: expense.isReimbursement,
    documents: [],
    notes: expense.notes,
    recurrenceRule: RecurrenceRule.NONE,
  }
}
