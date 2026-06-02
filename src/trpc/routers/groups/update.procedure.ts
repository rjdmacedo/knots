import { updateGroup } from '@/lib/api'
import { groupFormSchema } from '@/lib/schemas'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const updateGroupProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      groupFormValues: groupFormSchema,
    }),
  )
  .mutation(async ({ input: { groupId, groupFormValues } }) => {
    await updateGroup(groupId, groupFormValues)
  })
