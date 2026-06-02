'use client'

import { GroupForm } from '@/components/group-form'
import { trpc } from '@/trpc/client'
import { useSpinDelay } from 'spin-delay'
import { useCurrentGroup } from '../current-group-context'
import { MembersManagement } from './members-management'

export const EditGroup = ({ currentUserId }: { currentUserId: string }) => {
  const { groupId } = useCurrentGroup()
  const { data, isLoading: queryIsLoading } = trpc.groups.getDetails.useQuery({
    groupId,
  })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()
  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (isLoading) return <></>

  return (
    <>
      <GroupForm
        group={data?.group}
        onSubmit={async (groupFormValues) => {
          await mutateAsync({ groupId, groupFormValues })
          await utils.groups.invalidate()
        }}
      />
      {data?.group?.participants && (
        <MembersManagement
          groupId={groupId}
          members={data.group.participants}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
