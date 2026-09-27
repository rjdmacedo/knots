'use client'

import { GroupForm } from '@/components/group-form'
import { trpc } from '@/trpc/client'
import { useRouter } from 'next/navigation'

export const CreateGroup = ({
  defaultCurrencyCode,
}: {
  defaultCurrencyCode: string
}) => {
  const { mutateAsync } = trpc.groups.create.useMutation()
  const utils = trpc.useUtils()
  const router = useRouter()

  return (
    <GroupForm
      defaultCurrencyCode={defaultCurrencyCode}
      onSubmit={async (groupFormValues, members) => {
        const { groupId } = await mutateAsync({
          groupFormValues,
          members: members?.map((member) =>
            member.userId
              ? { userId: member.userId }
              : {
                  email: member.email,
                  ...(member.name.trim() ? { name: member.name.trim() } : {}),
                },
          ),
        })
        await utils.groups.invalidate()
        await utils.groupMembership.getUserGroups.invalidate()
        router.push(`/groups/${groupId}`)
      }}
    />
  )
}
