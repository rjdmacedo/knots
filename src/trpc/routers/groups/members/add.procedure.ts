import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const addMemberProcedure = protectedProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      email: z.string().email(),
      name: z.string().min(1).max(100).optional(),
    }),
  )
  .mutation(async ({ input: { groupId, email, name }, ctx: { user } }) => {
    // Verify the caller is the group owner
    const callerMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    })

    if (!callerMembership || callerMembership.role !== MembershipRole.OWNER) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the group owner can add members.',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Find or create the user
    let targetUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!targetUser) {
      // Create a placeholder user — they can claim this account later by registering
      targetUser = await prisma.user.create({
        data: {
          name: name || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          passwordHash: '', // Empty = placeholder, cannot log in
        },
      })
    }

    // Check if already a member
    const existingMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: targetUser.id, groupId } },
    })

    if (existingMembership) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'User is already a member of this group.',
      })
    }

    // Add the member
    await prisma.groupMembership.create({
      data: {
        userId: targetUser.id,
        groupId,
        role: MembershipRole.MEMBER,
      },
    })

    return { userId: targetUser.id, name: targetUser.name }
  })
