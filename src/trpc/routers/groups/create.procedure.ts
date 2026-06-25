import { createGroup } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { groupFormSchema } from '@/lib/schemas'
import { protectedProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { z } from 'zod'

export const createGroupProcedure = protectedProcedure
  .input(
    z.object({
      groupFormValues: groupFormSchema,
    }),
  )
  .mutation(async ({ ctx, input: { groupFormValues } }) => {
    const group = await createGroup(groupFormValues)

    // Auto-add the creator as the first group member with OWNER role
    await prisma.groupMembership.create({
      data: {
        userId: ctx.user.id,
        groupId: group.id,
        role: MembershipRole.OWNER,
      },
    })

    return { groupId: group.id, slug: group.slug }
  })
