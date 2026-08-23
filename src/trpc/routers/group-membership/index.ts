/**
 * Group membership and invitation tRPC router.
 * All procedures require authentication (protectedProcedure).
 * Group-specific operations verify membership before proceeding.
 */
import { groupService } from '@/lib/auth/group-service'
import { invitationService } from '@/lib/auth/invitation-service'
import { prisma } from '@/lib/prisma'
import { isBlockedByEmail } from '@/lib/profile/block-check'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const groupMembershipRouter = createTRPCRouter({
  /**
   * Create a new group. The authenticated user becomes the first member.
   */
  createGroup: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const result = await groupService.createGroup(input.name, ctx.user.id)

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            result.error === 'INVALID_NAME'
              ? 'Group name must be between 1 and 100 characters.'
              : 'You have reached the maximum number of groups (100).',
        })
      }

      return { groupId: result.groupId }
    }),

  /**
   * Get all groups the authenticated user belongs to.
   */
  getUserGroups: protectedProcedure.query(async ({ ctx }) => {
    return groupService.getUserGroups(ctx.user.id)
  }),

  /**
   * Create an invitation to a group. Requires membership in the group.
   */
  createInvitation: protectedProcedure
    .input(
      z.object({
        groupId: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isMember = await groupService.isMember(ctx.user.id, input.groupId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      // If the invitee has blocked the inviter, fail with a generic error
      const blocked = await isBlockedByEmail(ctx.user.id, input.email)
      if (blocked) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Something went wrong. Please try again.',
        })
      }

      const result = await invitationService.createInvitation(
        input.groupId,
        input.email,
        ctx.user.id,
      )

      if (!result.ok) {
        const messages: Record<string, string> = {
          DUPLICATE_PENDING: 'An invitation for this email is already pending.',
          GROUP_LIMIT_REACHED: 'The group membership limit has been reached.',
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: messages[result.error] ?? 'Failed to create invitation.',
        })
      }

      return { invitationId: result.invitationId }
    }),

  /**
   * Accept an invitation. The authenticated user's email must match the invitation.
   */
  acceptInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = ctx.user.email
      if (!email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Your account does not have an email address.',
        })
      }

      const result = await invitationService.acceptInvitation(
        input.invitationId,
        ctx.user.id,
        email,
      )

      if (!result.ok) {
        const messages: Record<string, string> = {
          EXPIRED: 'This invitation has expired.',
          REVOKED: 'This invitation has been revoked.',
          ALREADY_ACCEPTED: 'This invitation has already been accepted.',
          EMAIL_MISMATCH:
            'This invitation was sent to a different email address.',
          ALREADY_MEMBER: 'You are already a member of this group.',
          GROUP_LIMIT_REACHED:
            'You have reached the maximum number of groups (100).',
        }
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: messages[result.error] ?? 'Failed to accept invitation.',
        })
      }

      return { success: true }
    }),

  /**
   * Revoke a pending invitation. Requires membership in the invitation's group.
   */
  revokeInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Look up the invitation to find its groupId for membership check
      const { prisma } = await import('@/lib/prisma')
      const invitation = await prisma.invitation.findUnique({
        where: { id: input.invitationId },
        select: { groupId: true },
      })

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found.',
        })
      }

      const isMember = await groupService.isMember(
        ctx.user.id,
        invitation.groupId,
      )
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      const result = await invitationService.revokeInvitation(
        input.invitationId,
      )

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to revoke invitation.',
        })
      }

      return { success: true }
    }),

  /**
   * Get pending invitations for a group. Requires membership.
   */
  getPendingInvitations: protectedProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const isMember = await groupService.isMember(ctx.user.id, input.groupId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      return invitationService.getPendingInvitations(input.groupId)
    }),

  /**
   * Get all notification preferences for the authenticated user in a group.
   * Returns all six notification preference fields.
   * Requirements: 10.2
   */
  getNotificationPreferences: protectedProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const membership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: {
            userId: ctx.user.id,
            groupId: input.groupId,
          },
        },
        select: {
          emailNotificationsEnabled: true,
          notifyAllMembers: true,
          includedUserIds: true,
          notifyOnCreate: true,
          notifyOnUpdate: true,
          notifyOnDelete: true,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      return membership
    }),

  /**
   * Update any combination of notification preferences for the authenticated user in a group.
   * Accepts partial input; only the provided fields are written to GroupMembership.
   * Throws FORBIDDEN if the membership is not found.
   * Returns all six notification preference fields (same shape as getNotificationPreferences).
   * Requirements: 10.2, 10.3, 10.4
   */
  setNotificationPreferences: protectedProcedure
    .input(
      z.object({
        groupId: z.string().min(1),
        emailNotificationsEnabled: z.boolean().optional(),
        notifyAllMembers: z.boolean().optional(),
        includedUserIds: z.array(z.string()).optional(),
        notifyOnCreate: z.boolean().optional(),
        notifyOnUpdate: z.boolean().optional(),
        notifyOnDelete: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { groupId, ...fields } = input

      const membership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: {
            userId: ctx.user.id,
            groupId,
          },
        },
        select: { id: true },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      const updated = await prisma.groupMembership.update({
        where: { id: membership.id },
        data: fields,
        select: {
          emailNotificationsEnabled: true,
          notifyAllMembers: true,
          includedUserIds: true,
          notifyOnCreate: true,
          notifyOnUpdate: true,
          notifyOnDelete: true,
        },
      })

      return updated
    }),

  /**
   * Whether the authenticated member wants debounced email digests for this group.
   * @deprecated Use getNotificationPreferences instead.
   */
  getEmailNotifications: protectedProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const membership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: {
            userId: ctx.user.id,
            groupId: input.groupId,
          },
        },
        select: { emailNotificationsEnabled: true },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      return {
        emailNotificationsEnabled: membership.emailNotificationsEnabled,
      }
    }),

  /**
   * Opt in/out of debounced email digests for this group.
   * @deprecated Use setNotificationPreferences instead.
   */
  setEmailNotifications: protectedProcedure
    .input(
      z.object({
        groupId: z.string().min(1),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: {
            userId: ctx.user.id,
            groupId: input.groupId,
          },
        },
        select: { id: true },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group.',
        })
      }

      const updated = await prisma.groupMembership.update({
        where: { id: membership.id },
        data: { emailNotificationsEnabled: input.enabled },
        select: { emailNotificationsEnabled: true },
      })

      return {
        emailNotificationsEnabled: updated.emailNotificationsEnabled,
      }
    }),
})
