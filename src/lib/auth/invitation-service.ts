/**
 * Invitation Service — manages group invitations.
 * Handles creation, acceptance, revocation, and validation of invitations.
 */

import { planAccountNotification } from '@/lib/notifications/planner'
import { prisma } from '@/lib/prisma'

export type InvitationError =
  | 'EXPIRED'
  | 'REVOKED'
  | 'ALREADY_ACCEPTED'
  | 'EMAIL_MISMATCH'
  | 'ALREADY_MEMBER'
  | 'DUPLICATE_PENDING'
  | 'GROUP_LIMIT_REACHED'

export interface InvitationService {
  createInvitation(
    groupId: string,
    email: string,
    invitedBy: string,
  ): Promise<
    { ok: true; invitationId: string } | { ok: false; error: InvitationError }
  >
  acceptInvitation(
    invitationId: string,
    userId: string,
    email: string,
  ): Promise<{ ok: true } | { ok: false; error: InvitationError }>
  revokeInvitation(
    invitationId: string,
  ): Promise<{ ok: true } | { ok: false; error: InvitationError }>
  getPendingInvitations(
    groupId: string,
  ): Promise<
    Array<{ id: string; email: string; expiresAt: Date; createdAt: Date }>
  >
}

const MAX_GROUP_MEMBERSHIPS = 100
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

function createInvitationService(): InvitationService {
  return {
    async createInvitation(groupId, email, invitedBy) {
      const normalizedEmail = email.toLowerCase()

      // Check for existing PENDING invitation with same groupId + email (case-insensitive)
      const existingPending = await prisma.invitation.findFirst({
        where: {
          groupId,
          email: { equals: normalizedEmail, mode: 'insensitive' },
          status: 'PENDING',
        },
      })

      if (existingPending) {
        return { ok: false, error: 'DUPLICATE_PENDING' }
      }

      // Check user's group membership count < 100
      // Note: We check the invitee's potential membership count.
      // Since we don't know who will accept yet, we check the inviter's limit
      // as a proxy — but per the spec, the limit is on the accepting user.
      // For createInvitation, we check if the invited email's user (if exists)
      // would exceed the limit. However, since the user may not exist yet,
      // we skip this check here and enforce it at acceptance time.
      // Instead, we check the inviter's membership count as a sanity check.
      const inviterMembershipCount = await prisma.groupMembership.count({
        where: { userId: invitedBy },
      })

      if (inviterMembershipCount >= MAX_GROUP_MEMBERSHIPS) {
        return { ok: false, error: 'GROUP_LIMIT_REACHED' }
      }

      // Create invitation with 7-day expiry
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS)

      const baseUrl = getBaseUrl()
      const invitation = await prisma.$transaction(async (tx) => {
        const created = await tx.invitation.create({
          data: {
            groupId,
            email: normalizedEmail,
            invitedById: invitedBy,
            status: 'PENDING',
            expiresAt,
          },
          include: {
            group: { select: { name: true } },
          },
        })
        const recipient = await tx.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, locale: true },
        })
        const inviteLink = `${baseUrl}/invite/${created.id}`
        await planAccountNotification(tx, {
          eventKey: `group-invitation:${created.id}`,
          category: 'added-to-group',
          recipient: recipient
            ? {
                userId: recipient.id,
                email: recipient.email,
                locale: recipient.locale,
              }
            : { email: normalizedEmail },
          template: 'group-invitation',
          url: inviteLink,
          params: { groupName: created.group.name },
        })
        return created
      })
      return { ok: true, invitationId: invitation.id }
    },

    async acceptInvitation(invitationId, userId, email) {
      // Look up invitation by ID
      const invitation = await prisma.invitation.findUnique({
        where: { id: invitationId },
      })

      if (!invitation) {
        return { ok: false, error: 'EXPIRED' }
      }

      // Check status is PENDING
      if (invitation.status === 'ACCEPTED') {
        return { ok: false, error: 'ALREADY_ACCEPTED' }
      }

      if (invitation.status === 'REVOKED') {
        return { ok: false, error: 'REVOKED' }
      }

      // Check not expired
      if (new Date() > invitation.expiresAt) {
        return { ok: false, error: 'EXPIRED' }
      }

      // Case-insensitive email comparison
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        return { ok: false, error: 'EMAIL_MISMATCH' }
      }

      // Check user is not already a member
      const existingMembership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: {
            userId,
            groupId: invitation.groupId,
          },
        },
      })

      if (existingMembership) {
        return { ok: false, error: 'ALREADY_MEMBER' }
      }

      // Check user's group membership count < 100
      const membershipCount = await prisma.groupMembership.count({
        where: { userId },
      })

      if (membershipCount >= MAX_GROUP_MEMBERSHIPS) {
        return { ok: false, error: 'GROUP_LIMIT_REACHED' }
      }

      // Create GroupMembership record and update invitation status
      await prisma.$transaction([
        prisma.groupMembership.create({
          data: {
            userId,
            groupId: invitation.groupId,
          },
        }),
        prisma.invitation.update({
          where: { id: invitationId },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
        }),
      ])

      return { ok: true }
    },

    async revokeInvitation(invitationId) {
      const invitation = await prisma.invitation.findUnique({
        where: { id: invitationId },
      })

      if (!invitation) {
        return { ok: false, error: 'EXPIRED' }
      }

      await prisma.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED' },
      })

      return { ok: true }
    },

    async getPendingInvitations(groupId) {
      const invitations = await prisma.invitation.findMany({
        where: {
          groupId,
          status: 'PENDING',
        },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      return invitations
    },
  }
}

/** Singleton invitation service instance */
export const invitationService: InvitationService = createInvitationService()
