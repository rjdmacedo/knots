import { updateGroup } from '@/lib/api'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { groupFormSchema } from '@/lib/schemas'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const updateGroupProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      groupFormValues: groupFormSchema,
    }),
  )
  .mutation(async ({ input: { groupId, groupFormValues }, ctx }) => {
    await updateGroup(groupId, groupFormValues, ctx.user.id)
    notifyOnActivity(groupId, ActivityType.UPDATE_GROUP, {
      userId: ctx.user.id,
    })
  })
