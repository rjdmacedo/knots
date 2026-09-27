import { createGroup } from '@/lib/api'
import { addGroupMember } from '@/lib/group-members'
import { prisma } from '@/lib/prisma'
import { groupFormSchema } from '@/lib/schemas'
import { protectedProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { z } from 'zod'

const groupMemberInput = z.union([
  z.object({ userId: z.string().min(1) }),
  z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100).optional(),
  }),
])

export const createGroupProcedure = protectedProcedure
  .input(
    z.object({
      groupFormValues: groupFormSchema,
      members: z.array(groupMemberInput).max(50).optional(),
    }),
  )
  .mutation(async ({ ctx, input: { groupFormValues, members } }) => {
    const group = await createGroup(groupFormValues)

    // Auto-add the creator as the first group member with OWNER role
    await prisma.groupMembership.create({
      data: {
        userId: ctx.user.id,
        groupId: group.id,
        role: MembershipRole.OWNER,
      },
    })

    if (members && members.length > 0) {
      try {
        for (const member of members) {
          await addGroupMember({
            groupId: group.id,
            requesterUserId: ctx.user.id,
            idempotent: true,
            ...('userId' in member
              ? { userId: member.userId }
              : { email: member.email, name: member.name }),
          })
        }
      } catch (error) {
        await prisma.group
          .delete({ where: { id: group.id } })
          .catch(() => undefined)
        throw error
      }
    }

    return { groupId: group.id }
  })
