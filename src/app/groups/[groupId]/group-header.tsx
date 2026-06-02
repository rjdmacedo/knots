'use client'

import { GroupTabs } from '@/app/groups/[groupId]/group-tabs'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { PushNotificationToggle } from '@/components/push-notification-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()
  const { data: profile } = trpc.profile.getProfile.useQuery()

  return (
    <div className="flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl">
          <Link href={`/groups/${groupId}`}>
            {isLoading ? (
              <Skeleton className="mt-1.5 mb-1.5 h-5 w-32" />
            ) : (
              <div className="flex">{group.name}</div>
            )}
          </Link>
        </h1>

        <div className="flex items-center gap-1">
          {group && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
            <PushNotificationToggle
              groupId={groupId}
              currentUserId={profile?.id}
              members={group.participants.map((p) => ({
                id: p.id,
                name: p.name,
              }))}
            />
          )}
          {group && <ShareButton group={group} />}
        </div>
      </div>

      <GroupTabs groupId={groupId} />
    </div>
  )
}
