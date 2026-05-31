import { prisma } from '@/lib/prisma'

/**
 * Normalizes the expense title for use as a lookup key.
 * - Converts to lowercase
 * - Trims leading/trailing whitespace
 * - Collapses consecutive internal spaces to a single space
 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Creates or updates the title-category mapping for a group.
 * Does nothing if:
 * - The normalized title has fewer than 2 characters
 * - The expense is marked as reimbursement
 */
export async function upsertCategoryMapping(params: {
  groupId: string
  title: string
  categoryId: number
  isReimbursement: boolean
}): Promise<void> {
  const { groupId, title, categoryId, isReimbursement } = params

  if (isReimbursement) return

  const normalizedTitle = normalizeTitle(title)

  if (normalizedTitle.length < 2) return

  await prisma.expenseCategoryMapping.upsert({
    where: {
      groupId_normalizedTitle: {
        groupId,
        normalizedTitle,
      },
    },
    update: {
      categoryId,
    },
    create: {
      groupId,
      normalizedTitle,
      categoryId,
    },
  })
}

/**
 * Looks up the title-category mapping for a group.
 * Returns the categoryId if a valid mapping exists, null otherwise.
 * Validates that the category still exists before returning.
 */
export async function lookupCategoryMapping(params: {
  groupId: string
  title: string
}): Promise<number | null> {
  const { groupId, title } = params

  const normalizedTitle = normalizeTitle(title)

  const mapping = await prisma.expenseCategoryMapping.findUnique({
    where: {
      groupId_normalizedTitle: {
        groupId,
        normalizedTitle,
      },
    },
  })

  if (!mapping) return null

  // Validate that the category still exists
  const category = await prisma.category.findUnique({
    where: { id: mapping.categoryId },
  })

  if (!category) return null

  return mapping.categoryId
}
