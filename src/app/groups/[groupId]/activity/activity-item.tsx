'use client'
import { Button, buttonVariants } from '@/components/ui/button'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'
import {
  DateTimeStyle,
  cn,
  formatDate,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ActivityType } from '@prisma/client'
import {
  Banknote,
  ChevronRight,
  Pencil,
  PlusCircle,
  Settings,
  Trash2,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChangeList } from './change-list'

export type Activity =
  AppRouterOutput['groups']['activities']['list']['activities'][number]

export type ActivityGroup = Pick<
  AppRouterOutput['activities']['list']['activities'][number]['group'],
  'id' | 'name' | 'currency' | 'currencyCode' | 'participants'
>

type Props = {
  groupId: string
  activity: Activity
  group: ActivityGroup
  participant?: { id: string; name: string }
  dateStyle: DateTimeStyle
  categories: Array<{ id: number; grouping: string; name: string }>
  showGroupName?: boolean
  variant?: 'default' | 'card'
}

function isPaymentActivity(activity: Activity) {
  return activity.expense?.isReimbursement === true
}

function openActivityExpense(
  router: ReturnType<typeof useRouter>,
  groupId: string,
  expenseId: string | null,
) {
  if (!expenseId) return
  router.push(getGroupExpenseDetailPath(groupId, expenseId))
}

function useSummary(activity: Activity, participantName?: string) {
  const t = useTranslations('Activity')
  const participant = participantName ?? t('someone')
  const expense = activity.data?.trim() || t('reimbursement')
  const isPayment = isPaymentActivity(activity)

  const tr = (key: string) =>
    t.rich(key, {
      expense,
      participant,
      em: (chunks) => <em>&ldquo;{chunks}&rdquo;</em>,
      strong: (chunks) => <strong>{chunks}</strong>,
    })

  if (activity.activityType == ActivityType.UPDATE_GROUP) {
    return <>{tr('settingsModified')}</>
  } else if (activity.activityType == ActivityType.CREATE_EXPENSE) {
    return <>{tr(isPayment ? 'paymentRecorded' : 'expenseCreated')}</>
  } else if (activity.activityType == ActivityType.UPDATE_EXPENSE) {
    return <>{tr(isPayment ? 'paymentUpdated' : 'expenseUpdated')}</>
  } else if (activity.activityType == ActivityType.DELETE_EXPENSE) {
    return <>{tr(isPayment ? 'paymentDeleted' : 'expenseDeleted')}</>
  }
}

function ActivityTypeIcon({
  activityType,
  isPayment,
}: {
  activityType: ActivityType
  isPayment: boolean
}) {
  const className = 'w-4 h-4 mt-0.5 text-muted-foreground'

  switch (activityType) {
    case ActivityType.CREATE_EXPENSE:
      return isPayment ? (
        <Banknote className={className} />
      ) : (
        <PlusCircle className={className} />
      )
    case ActivityType.UPDATE_EXPENSE:
      return <Pencil className={className} />
    case ActivityType.DELETE_EXPENSE:
      return <Trash2 className={className} />
    case ActivityType.UPDATE_GROUP:
      return <Settings className={className} />
    default:
      return <Pencil className={className} />
  }
}

export function ActivityItem({
  groupId,
  activity,
  group,
  participant,
  dateStyle,
  categories,
  showGroupName,
  variant = 'default',
}: Props) {
  const locale = useLocale()
  const router = useRouter()

  const expenseExists = activity.expense !== undefined
  const isPayment = isPaymentActivity(activity)
  const summary = useSummary(activity, participant?.name)
  const isRecent = dateStyle === undefined
  const timeFormatOptions = isRecent
    ? ({ timeStyle: 'medium' } as const)
    : ({ timeStyle: 'short' } as const)

  const hasChanges = activity.changes && activity.changes.length > 0

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'flex justify-between sm:mx-6 px-4 sm:rounded-lg sm:pr-2 sm:pl-4 py-4 text-sm gap-1 items-stretch',
          expenseExists && 'cursor-pointer hover:bg-accent',
        )}
        onClick={() => {
          if (expenseExists && activity.expenseId) {
            openActivityExpense(router, groupId, activity.expenseId)
          }
        }}
      >
        <div className="flex flex-col items-center mr-2 gap-1">
          <ActivityTypeIcon
            activityType={activity.activityType}
            isPayment={isPayment}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-1">{summary}</div>
          {hasChanges && (
            <ChangeList
              changes={activity.changes}
              groupCurrency={getCurrencyFromGroup(group)}
              participants={group.participants}
              categories={categories}
              indented={false}
            />
          )}
        </div>
        <div className="flex flex-col justify-between items-end shrink-0">
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatDate(activity.time, locale, timeFormatOptions)}
          </div>
          {dateStyle !== undefined && (
            <div className="text-xs text-muted-foreground">
              {formatDate(activity.time, locale, { dateStyle })}
            </div>
          )}
        </div>
        {expenseExists && activity.expenseId && (
          <Button
            type="button"
            variant="link"
            size="icon"
            className={cn(
              buttonVariants({ size: 'icon', variant: 'link' }),
              'self-center hidden sm:flex',
            )}
            onClick={(event) => {
              event.stopPropagation()
              openActivityExpense(router, groupId, activity.expenseId)
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex justify-between sm:rounded-lg px-2 sm:pr-1 sm:pl-2 py-2 text-sm hover:bg-accent gap-1 items-stretch',
        expenseExists && 'cursor-pointer',
      )}
      onClick={() => {
        if (expenseExists && activity.expenseId) {
          openActivityExpense(router, groupId, activity.expenseId)
        }
      }}
    >
      <div className="flex flex-col justify-between items-start">
        {dateStyle !== undefined && (
          <div className="mt-1 text-xs/5 text-muted-foreground">
            {formatDate(activity.time, locale, { dateStyle })}
          </div>
        )}
        <div className="my-1 text-xs/5 text-muted-foreground">
          {formatDate(activity.time, locale, timeFormatOptions)}
        </div>
      </div>
      <div className="flex-1">
        {showGroupName && (
          <div className="m-1 text-xs text-muted-foreground">
            <Link
              href={`/groups/${groupId}`}
              className={cn(buttonVariants())}
              onClick={(event) => event.stopPropagation()}
            >
              {group.name}
            </Link>
          </div>
        )}
        <div className="m-1">{summary}</div>
        {hasChanges && (
          <ChangeList
            changes={activity.changes}
            groupCurrency={getCurrencyFromGroup(group)}
            participants={group.participants}
            categories={categories}
          />
        )}
      </div>
      {expenseExists && activity.expenseId && (
        <Button
          type="button"
          variant="link"
          size="icon"
          className={cn(
            buttonVariants({ size: 'icon', variant: 'link' }),
            'self-center hidden sm:flex w-5 h-5',
          )}
          onClick={(event) => {
            event.stopPropagation()
            openActivityExpense(router, groupId, activity.expenseId)
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}
