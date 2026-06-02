import { addGroupMember } from '@/lib/group-members'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const memberToAddSchema = z
  .object({
    exportName: z.string().min(1),
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const hasUserId = !!data.userId
    const hasEmail = !!data.email

    if (hasUserId === hasEmail) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exactly one of userId or email must be provided.',
        path: ['userId'],
      })
    }
  })

export async function addMembersFromKnotsImport(input: {
  groupId: string
  requesterUserId: string
  membersToAdd: z.infer<typeof memberToAddSchema>[]
}) {
  const results = []

  for (const member of input.membersToAdd) {
    try {
      const result = await addGroupMember({
        groupId: input.groupId,
        ...(member.userId
          ? { userId: member.userId }
          : { email: member.email! }),
        name: member.name ?? member.exportName,
        requesterUserId: input.requesterUserId,
        idempotent: true,
      })
      results.push({ exportName: member.exportName, ...result })
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          error instanceof Error
            ? `Failed to add "${member.exportName}": ${error.message}`
            : `Failed to add "${member.exportName}"`,
      })
    }
  }

  return results
}
