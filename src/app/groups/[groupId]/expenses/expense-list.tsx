'use client'
import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import { GroupedExpenseCards } from '@/app/groups/[groupId]/expenses/grouped-expense-cards'
import { SearchBar } from '@/components/ui/search-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { forwardRef, useEffect, useState } from 'react'
import { useInView } from 'react-intersection-observer'
import { useSpinDelay } from 'spin-delay'
import { useDebounce } from 'use-debounce'
import { useCurrentGroup } from '../current-group-context'

const PAGE_SIZE = 20

export function ExpenseList() {
  const { groupId, group } = useCurrentGroup()
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText] = useDebounce(searchText, 300)

  const participants = group?.participants

  useEffect(() => {
    if (!participants) return

    const activeUser = localStorage.getItem('newGroup-activeUser')
    const newUser = localStorage.getItem(`${groupId}-newUser`)
    if (activeUser || newUser) {
      localStorage.removeItem('newGroup-activeUser')
      localStorage.removeItem(`${groupId}-newUser`)
      if (activeUser === 'None') {
        localStorage.setItem(`${groupId}-activeUser`, 'None')
      } else {
        const userId = participants.find(
          (p) => p.name === (activeUser || newUser),
        )?.id
        if (userId) {
          localStorage.setItem(`${groupId}-activeUser`, userId)
        }
      }
    }
  }, [groupId, participants])

  return (
    <>
      <div className="mb-2 sm:mb-3">
        <SearchBar onValueChange={(value) => setSearchText(value)} />
      </div>
      <ExpenseListForSearch
        groupId={groupId}
        searchText={debouncedSearchText}
      />
    </>
  )
}

const ExpenseListForSearch = ({
  groupId,
  searchText,
}: {
  groupId: string
  searchText: string
}) => {
  const { group } = useCurrentGroup()

  const t = useTranslations('Expenses')
  const { ref: loadingRef, inView } = useInView()

  const {
    data,
    isLoading: expensesAreLoading,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.groups.expenses.list.useInfiniteQuery(
    { groupId, limit: PAGE_SIZE, filter: searchText },
    {
      getNextPageParam: ({ nextCursor }) => nextCursor,
    },
  )
  const expenses = data?.pages.flatMap((page) => page.expenses)
  const hasMore = data?.pages.at(-1)?.hasMore ?? false

  const isLoading = useSpinDelay(expensesAreLoading || !expenses || !group, {
    delay: 200,
    minDuration: 300,
  })

  useEffect(() => {
    if (inView && hasMore && !isLoading && !isFetchingNextPage) fetchNextPage()
  }, [fetchNextPage, hasMore, inView, isLoading, isFetchingNextPage])

  if (isLoading) return <ExpensesLoading />

  if (!expenses || !group) return <ExpensesLoading />

  if (expenses.length === 0)
    return (
      <p className="px-6 text-sm py-6 text-muted-foreground">
        {t('noExpenses')}
      </p>
    )

  return (
    <>
      <GroupedExpenseCards
        items={expenses}
        getDate={(expense) => expense.expenseDate}
        getKey={(expense) => expense.id}
        renderCard={(expense) => (
          <ExpenseCard
            expense={expense}
            currency={getCurrencyFromGroup(group)}
            groupId={groupId}
            participantCount={group.participants.length}
          />
        )}
      />
      {hasMore && <ExpensesLoading ref={loadingRef} />}
    </>
  )
}

const ExpensesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref}>
      <Skeleton className="mx-4 sm:mx-6 mt-1 mb-2 h-3 w-32 rounded-full" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex justify-between items-start px-2 sm:px-6 py-4 text-sm gap-2"
        >
          <div className="flex-0 pl-2 pr-1">
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-32 rounded-full" />
          </div>
          <div className="flex-0 flex flex-col gap-2 items-end mr-2 sm:mr-12">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
})
ExpensesLoading.displayName = 'ExpensesLoading'
