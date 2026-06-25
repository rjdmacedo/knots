import { prisma } from '@/lib/prisma'

/**
 * Converts a string into a URL-friendly slug.
 * - Lowercases
 * - Replaces spaces and special chars with hyphens
 * - Removes consecutive hyphens
 * - Trims hyphens from start/end
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphen
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-|-$/g, '') // trim leading/trailing hyphens
}

/**
 * Generates a unique group slug. If the base slug already exists,
 * appends an incrementing numeric suffix (e.g. "trip-to-paris-2").
 */
export async function generateUniqueGroupSlug(name: string): Promise<string> {
  const base = slugify(name) || 'group'

  // Check if the base slug is available
  const existing = await prisma.group.findUnique({
    where: { slug: base },
    select: { id: true },
  })

  if (!existing) return base

  // Find the next available suffix
  // Look for slugs that start with the base and end with a number
  const similar = await prisma.group.findMany({
    where: {
      slug: { startsWith: `${base}-` },
    },
    select: { slug: true },
  })

  const suffixes = similar
    .map((g) => {
      const suffix = g.slug.slice(base.length + 1)
      const num = parseInt(suffix, 10)
      return isNaN(num) ? 0 : num
    })
    .filter((n) => n > 0)

  const nextSuffix = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 2

  return `${base}-${nextSuffix}`
}

/**
 * Generates a unique username from an email prefix or provided string.
 * If the base username is taken, appends a numeric suffix.
 */
export async function generateUniqueUsername(
  base: string,
  excludeUserId?: string,
): Promise<string> {
  const normalized = slugify(base) || 'user'

  // Check if available
  const existing = await prisma.user.findUnique({
    where: { username: normalized },
    select: { id: true },
  })

  if (!existing || (excludeUserId && existing.id === excludeUserId)) {
    return normalized
  }

  // Find next available suffix
  const similar = await prisma.user.findMany({
    where: {
      username: { startsWith: `${normalized}-` },
    },
    select: { username: true },
  })

  const suffixes = similar
    .map((u) => {
      const suffix = u.username.slice(normalized.length + 1)
      const num = parseInt(suffix, 10)
      return isNaN(num) ? 0 : num
    })
    .filter((n) => n > 0)

  const nextSuffix = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 2

  return `${normalized}-${nextSuffix}`
}

/**
 * Extracts the username base from an email address (everything before @).
 */
export function usernameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? 'user'
  return slugify(localPart) || 'user'
}
