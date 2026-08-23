import 'server-only'

import { ActivityType } from '@prisma/client'

import { emailService } from '@/lib/auth/email-service'
import { prisma } from '@/lib/prisma'
import { isActivityTypeEnabled } from '@/lib/push/subscription-filters'

/** Debounce window after the last group change before sending digest emails. */
export const GROUP_EMAIL_DIGEST_DELAY_MS = 5 * 60 * 1000

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

/**
 * Upsert a pending digest for the group, resetting `sendAfter` to now + 5 minutes.
 * No-op when nobody in the group has email notifications enabled, or when the
 * actor is the only opted-in member.
 */
export async function scheduleGroupEmailDigest(
  groupId: string,
  actorUserId: string,
): Promise<void> {
  const optedInCount = await prisma.groupMembership.count({
    where: {
      groupId,
      emailNotificationsEnabled: true,
      archivedAt: null,
      userId: { not: actorUserId },
    },
  })

  if (optedInCount === 0) {
    return
  }

  const sendAfter = new Date(Date.now() + GROUP_EMAIL_DIGEST_DELAY_MS)

  await prisma.groupEmailDigestPending.upsert({
    where: { groupId },
    create: {
      groupId,
      lastActorUserId: actorUserId,
      sendAfter,
    },
    update: {
      lastActorUserId: actorUserId,
      sendAfter,
    },
  })
}

/**
 * Fire-and-forget: schedule/resets the 5-minute debounce for this group.
 * Sending is handled by the in-process scheduler (`group-activity-digest-scheduler.ts`).
 */
export function scheduleGroupEmailDigestOnActivity(
  groupId: string,
  actorUserId: string,
): void {
  scheduleGroupEmailDigest(groupId, actorUserId).catch((error) => {
    console.error('[email-digest] Failed to schedule digest:', error)
  })
}

export type ProcessGroupEmailDigestsResult = {
  processed: number
  sent: number
  skipped: number
  errors: number
}

/**
 * Send due digests and clear pending rows.
 */
export async function processDueGroupEmailDigests(
  now = new Date(),
): Promise<ProcessGroupEmailDigestsResult> {
  const due = await prisma.groupEmailDigestPending.findMany({
    where: { sendAfter: { lte: now } },
    include: {
      group: { select: { id: true, name: true } },
    },
  })

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const pending of due) {
    try {
      // Query the activity window [pending.createdAt, pending.sendAfter)
      const windowActivities = await prisma.activity.findMany({
        where: {
          groupId: pending.groupId,
          time: { gte: pending.createdAt, lt: pending.sendAfter },
        },
        select: { activityType: true, participantId: true },
      })

      const windowEventTypes = new Set<ActivityType>(
        windowActivities.map((a) => a.activityType),
      )
      const windowActorIds = new Set<string>(
        windowActivities
          .map((a) => a.participantId)
          .filter((id): id is string => id !== null),
      )

      const [actor, candidates] = await Promise.all([
        prisma.user.findUnique({
          where: { id: pending.lastActorUserId },
          select: { id: true, name: true },
        }),
        prisma.groupMembership.findMany({
          where: {
            groupId: pending.groupId,
            emailNotificationsEnabled: true,
            archivedAt: null,
            ...(windowActorIds.size > 0
              ? { userId: { notIn: Array.from(windowActorIds) } }
              : {}),
          },
          select: {
            userId: true,
            notifyAllMembers: true,
            includedUserIds: true,
            notifyOnCreate: true,
            notifyOnUpdate: true,
            notifyOnDelete: true,
            user: {
              select: {
                id: true,
                email: true,
                emailVerified: true,
                name: true,
              },
            },
          },
        }),
      ])

      // Apply event-type and member filters
      const recipients = candidates.filter((membership) => {
        // Require at least one activity type in the window that this member wants
        const wantsEventType = Array.from(windowEventTypes).some(
          (activityType) => isActivityTypeEnabled(activityType, membership),
        )
        if (!wantsEventType) return false

        // If notifyAllMembers = false, require at least one window actor in includedUserIds
        if (!membership.notifyAllMembers) {
          const hasTrackedActor = Array.from(windowActorIds).some((actorId) =>
            membership.includedUserIds.includes(actorId),
          )
          if (!hasTrackedActor) return false
        }

        return true
      })

      const actorName = actor?.name?.trim() || 'Someone'
      const groupName = pending.group.name
      const activityLink = `${getBaseUrl()}/groups/${pending.groupId}/activity`

      const deliverable = recipients.filter(
        (membership) =>
          membership.user.emailVerified != null &&
          membership.user.email.trim().length > 0,
      )

      if (deliverable.length === 0) {
        skipped += 1
      } else {
        for (const membership of deliverable) {
          const result = await emailService.sendGroupActivityDigestEmail(
            membership.user.email,
            actorName,
            groupName,
            activityLink,
          )
          if (result.ok) {
            sent += 1
          } else {
            errors += 1
            console.error(
              `[email-digest] Failed to send to ${membership.user.email}:`,
              result.error,
            )
          }
        }
      }

      await prisma.groupEmailDigestPending.delete({
        where: { groupId: pending.groupId },
      })
    } catch (error) {
      errors += 1
      console.error(
        `[email-digest] Failed processing group ${pending.groupId}:`,
        error,
      )
    }
  }

  return {
    processed: due.length,
    sent,
    skipped,
    errors,
  }
}
