/**
 * Session Limit — enforces maximum 10 concurrent sessions per user.
 * Uses LRU eviction (oldest createdAt) to remove the least recently used
 * session when the limit is reached.
 */
import { prisma } from '@/lib/prisma'

/** Maximum number of concurrent sessions allowed per user. */
export const MAX_SESSIONS = 10

/**
 * Enforces the session limit for a user. If the user has >= maxSessions,
 * deletes the oldest sessions (by createdAt) to make room for a new one.
 *
 * This should be called when a new session is created, so it trims
 * sessions to maxSessions - 1, leaving room for the newly created session.
 *
 * @param userId - The ID of the user to enforce the limit for
 * @param maxSessions - Maximum allowed sessions (defaults to MAX_SESSIONS)
 */
export async function enforceSessionLimit(
  userId: string,
  maxSessions: number = MAX_SESSIONS,
): Promise<void> {
  const sessionCount = await prisma.session.count({
    where: { userId },
  })

  if (sessionCount < maxSessions) {
    return
  }

  // Number of sessions to delete to bring count to maxSessions - 1
  // (making room for the new session that triggered this call)
  const sessionsToDelete = sessionCount - maxSessions + 1

  // Find the oldest sessions by createdAt (LRU = least recently used)
  const oldestSessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: sessionsToDelete,
    select: { id: true },
  })

  if (oldestSessions.length > 0) {
    await prisma.session.deleteMany({
      where: {
        id: { in: oldestSessions.map((s) => s.id) },
      },
    })
  }
}
