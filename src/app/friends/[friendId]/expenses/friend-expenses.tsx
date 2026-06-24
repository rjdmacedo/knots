'use client'

import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FriendExpenseItem } from '@/lib/friend-expenses'
import { trpc } from '@/trpc/client'
import { GroupType } from '@prisma/client'
import dayjs, { type Dayjs } from 'dayjs'
import { Loader2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useSpinDelay } from 'spin-delay'

const EXPENSE_GROUPS = {
  UPCOMING: 'upcoming',
  THIS_WEEK: 'thisWeek',
  EARLIER_THIS_MONTH: 'earlierThisMonth',
  LAST_MONTH: 'lastMonth',
  EARLIER_THIS_YEAR: 'earlierThisYear',
  LAST_YEAR: 'lastYear',
  OLDER: 'older',
}

function getExpenseGroup(date: Dayjs, today: Dayjs) {
  if (today.isBefore(date)) {
    return EXPENSE_GROUPS.UPCOMING
  } else if (today.isSame(date, 'week')) {
    return EXPENSE_GROUPS.THIS_WEEK
  } else if (today.isSame(date, 'month')) {
    return EXPENSE_GROUPS.EARLIER_THIS_MONTH
  } else if (today.subtract(1, 'month').isSame(date, 'month')) {
    return EXPENSE_GROUPS.LAST_MONTH
  } else if (today.isSame(date, 'year')) {
    return EXPENSE_GROUPS.EARLIER_THIS_YEAR
  } else if (today.subtract(1, 'year').isSame(date, 'year')) {
    return EXPENSE_GROUPS.LAST_YEAR
  } else {
    return EXPENSE_GROUPS.OLDER
  }
}

function getGroupedFriendExpensesByDate(expenses: FriendExpenseItem[]) {
  const today = dayjs()
  return expenses.reduce(
    (result: { [key: string]: FriendExpenseItem[] }, item) => {
      const expenseGroup = getExpenseGroup(
        dayjs(item.expense.expenseDate),
        today,
      )
      result[expenseGroup] = result[expenseGroup] ?? []
      result[expenseGroup].push(item)
      return result
    },
    {},
  )
}

type Props = {
  friendId: string
}

export function FriendExpenses({ friendId }: Props) {
  const t = useTranslations('Friends.Expenses')
  const t_expenses = useTranslations('Expenses')
  const router = useRouter()
  const {
    data,
    isLoading: queryIsLoading,
    isError,
    refetch,
  } = trpc.friends.getExpenses.useQuery({ friendId })

  const findOrCreateDyadGroup = trpc.friends.findOrCreateDyadGroup.useMutation({
    onSuccess: ({ groupId }) => {
      router.push(`/groups/${groupId}/expenses/create`)
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const isLoading = useSpinDelay(queryIsLoading, {
    delay: 200,
    minDuration: 300,
  })

  const groupedExpensesByDate = useMemo(
    () => (data?.expenses ? getGroupedFriendExpensesByDate(data.expenses) : {}),
    [data?.expenses],
  )

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-muted-foreground">{t('loadError')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    )
  }

  const { expenses } = data

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>{t('listTitle')}</CardTitle>
        <CardDescription>{t('listDescription')}</CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  disabled={findOrCreateDyadGroup.isPending}
                  onClick={() => findOrCreateDyadGroup.mutate({ friendId })}
                />
              }
            >
              {findOrCreateDyadGroup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </TooltipTrigger>
            <TooltipContent>{t_expenses('create')}</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {expenses.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {t('empty')}
          </p>
        ) : (
          <>
            {Object.values(EXPENSE_GROUPS).map((expenseGroup) => {
              const groupItems = groupedExpensesByDate[expenseGroup]
              if (!groupItems || groupItems.length === 0) return null

              return (
                <div key={expenseGroup}>
                  <div className="text-xs py-1 font-semibold sticky top-0 z-10 bg-background px-6">
                    {t_expenses(`Groups.${expenseGroup}`)}
                  </div>
                  {groupItems.map((item) => (
                    <div key={`${item.groupId}-${item.expense.id}`}>
                      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                        {item.groupType === GroupType.DYAD ? (
                          <Badge variant="secondary">
                            {t('directExpenses')}
                          </Badge>
                        ) : (
                          <Link
                            href={`/groups/${item.groupId}/expenses`}
                            className="hover:underline"
                          >
                            <Badge variant="outline">{item.groupName}</Badge>
                          </Link>
                        )}
                      </div>
                      <ExpenseCard
                        expense={item.expense}
                        currency={item.currency}
                        groupId={item.groupId}
                        participantCount={item.memberCount}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  )
}
