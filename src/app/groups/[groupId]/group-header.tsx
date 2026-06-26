'use client'

import { useCurrentGroup } from '@/app/groups/[groupId]/current-group-context'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import {
  DetailPageHeader,
  DetailPageTabs,
} from '@/components/detail-page-layout'
import { PushNotificationToggle } from '@/components/push-notification-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'

export const GroupHeader = () => {
  const t = useTranslations('Groups')
  const tTabs = useTranslations()
  const { isLoading, groupId, group } = useCurrentGroup()
  const { data: profile } = trpc.profile.getProfile.useQuery()

  const basePath = `/groups/${groupId}`
  const description =
    group?.information?.trim() ||
    (!isLoading && group ? t('detailDescription') : undefined)

  const tabs = [
    { value: 'expenses', label: tTabs('Expenses.title') },
    { value: 'balances', label: tTabs('Balances.title') },
    { value: 'information', label: tTabs('Information.title') },
    { value: 'stats', label: tTabs('Stats.title') },
    { value: 'activity', label: tTabs('Activity.title') },
    { value: 'edit', label: tTabs('Settings.title') },
  ]

  return (
    <DetailPageHeader
      backHref="/groups"
      backLabel={t('backToGroups')}
      title={isLoading ? <Skeleton className="h-7 w-48" /> : group?.name}
      description={description}
      actions={
        group ? (
          <>
            {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
              <PushNotificationToggle
                groupId={groupId}
                currentUserId={profile?.id}
                members={group.participants.map((participant) => ({
                  id: participant.id,
                  name: participant.name,
                }))}
              />
            )}
            <ShareButton group={group} />
          </>
        ) : undefined
      }
      tabs={<DetailPageTabs basePath={basePath} tabs={tabs} />}
    />
  )
}
