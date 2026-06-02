/**
 * Utility to check if a user has been blocked by another user.
 * Used across friend requests, group invitations, and suggestions
 * to silently enforce block rules without revealing the block to the blocked user.
 *
 * Blocking is email-based: it works even if the blocked user doesn't have an account yet.
 */
import { prisma } from '@/lib/prisma'

/**
 * Checks if `targetUserId` has blocked `actorUserId`.
 * Resolves the actor's email and checks the target's block list.
 */
export async function isBlockedBy(
  actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { email: true },
  })

  if (!actor) return false

  const block = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedEmail: {
        userId: targetUserId,
        blockedEmail: actor.email.toLowerCase(),
      },
    },
    select: { id: true },
  })

  return block !== null
}

/**
 * Checks if the user identified by `targetEmail` has blocked `actorUserId`.
 * Resolves the target user by email first to get their userId,
 * then checks their block list for the actor's email.
 */
export async function isBlockedByEmail(
  actorUserId: string,
  targetEmail: string,
): Promise<boolean> {
  const normalizedTarget = targetEmail.toLowerCase().trim()

  const targetUser = await prisma.user.findUnique({
    where: { email: normalizedTarget },
    select: { id: true },
  })

  if (!targetUser) {
    return false
  }

  return isBlockedBy(actorUserId, targetUser.id)
}
