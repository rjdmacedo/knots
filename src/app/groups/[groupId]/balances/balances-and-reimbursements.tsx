'use client'

import { BalancesList } from '@/app/groups/[groupId]/balances-list'
import { ReimbursementList } from '@/app/groups/[groupId]/reimbursement-list'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { Fragment, useEffect } from 'react'
import { useSpinDelay } from 'spin-delay'
import { match } from 'ts-pattern'
import { useCurrentGroup } from '../current-group-context'
import { BalancesActions } from './balances-actions'

type Props = {
  currentUserId?: string
}

export default function BalancesAndReimbursements({ currentUserId }: Props) {
  const utils = trpc.useUtils()
  const { groupId, group } = useCurrentGroup()
  const { data: profile } = trpc.profile.getProfile.useQuery()
  const resolvedUserId = currentUserId ?? profile?.id
  const { data: balancesData, isLoading: balancesAreLoading } =
    trpc.groups.balances.list.useQuery({
      groupId,
    })
  const t = useTranslations('Balances')

  useEffect(() => {
    // Until we use tRPC more widely and can invalidate the cache on expense
    // update, it's easier and safer to invalidate the cache on page load.
    utils.groups.balances.invalidate()
  }, [utils])

  const isLoading = useSpinDelay(
    balancesAreLoading || !balancesData || !group,
    {
      delay: 200,
      minDuration: 300,
    },
  )

  return (
    <>
      {isLoading ? (
        <BalancesActionsSkeleton />
      ) : (
        resolvedUserId && (
          <BalancesActions
            groupId={groupId}
            reimbursements={balancesData!.reimbursements}
            participants={group!.participants}
            currency={getCurrencyFromGroup(group!)}
            currentUserId={resolvedUserId}
          />
        )
      )}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <BalancesLoading participantCount={group?.participants.length} />
          ) : (
            <BalancesList
              balances={balancesData!.balances}
              participants={group!.participants}
              currency={getCurrencyFromGroup(group!)}
              reimbursements={balancesData!.reimbursements}
            />
          )}
        </CardContent>
      </Card>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('Reimbursements.title')}</CardTitle>
          <CardDescription>{t('Reimbursements.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <ReimbursementsLoading
              participantCount={group?.participants.length}
            />
          ) : (
            <ReimbursementList
              reimbursements={balancesData!.reimbursements}
              participants={group!.participants}
              currency={getCurrencyFromGroup(group!)}
              groupId={groupId}
              groupName={group!.name}
              currentUserId={resolvedUserId}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}

const BalancesActionsSkeleton = () => (
  <Card size="sm" className="mb-4">
    <CardContent className="flex flex-col gap-3">
      <Skeleton className="h-5 w-56" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
    </CardContent>
  </Card>
)

const ReimbursementsLoading = ({
  participantCount = 3,
}: {
  participantCount?: number
}) => {
  return (
    <div className="flex flex-col">
      {Array(participantCount - 1)
        .fill(undefined)
        .map((_, index) => (
          <div key={index} className="flex justify-between py-5">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
    </div>
  )
}

const BalancesLoading = ({
  participantCount = 3,
}: {
  participantCount?: number
}) => {
  const barWidth = (index: number) =>
    match(index % 3)
      .with(0, () => 'w-1/3')
      .with(1, () => 'w-2/3')
      .otherwise(() => 'w-full')

  return (
    <div className="grid grid-cols-2 py-1 gap-y-2">
      {Array(participantCount)
        .fill(undefined)
        .map((_, index) =>
          index % 2 === 0 ? (
            <Fragment key={index}>
              <div className="flex items-center justify-end pr-2">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="self-start">
                <Skeleton className={`h-7 ${barWidth(index)} rounded-l-none`} />
              </div>
            </Fragment>
          ) : (
            <Fragment key={index}>
              <div className="flex items-center justify-end">
                <Skeleton className={`h-7 ${barWidth(index)} rounded-r-none`} />
              </div>
              <div className="flex items-center pl-2">
                <Skeleton className="h-3 w-16" />
              </div>
            </Fragment>
          ),
        )}
    </div>
  )
}
