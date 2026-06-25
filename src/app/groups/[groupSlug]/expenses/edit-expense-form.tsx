'use client'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { trpc } from '@/trpc/client'
import { useRouter } from 'next/navigation'
import { ExpenseForm } from './expense-form'

export function EditExpenseForm({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const { data: expenseData } = trpc.groups.expenses.get.useQuery({
    groupId,
    expenseId,
  })
  const expense = expenseData?.expense

  const { mutateAsync: updateExpenseMutateAsync } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteExpenseMutateAsync } =
    trpc.groups.expenses.delete.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()

  if (!group || !categories || !expense) return null

  return (
    <ExpenseForm
      group={group}
      expense={expense}
      categories={categories}
      onSubmit={async (expenseFormValues, _participantId) => {
        await updateExpenseMutateAsync({
          expenseId,
          groupId,
          expenseFormValues,
        })
        utils.groups.expenses.invalidate()
        invalidateActivityQueries(utils)
        router.push(`/groups/${group.slug}`)
      }}
      onDelete={async (_participantId) => {
        await deleteExpenseMutateAsync({
          expenseId,
          groupId,
        })
        utils.groups.expenses.invalidate()
        invalidateActivityQueries(utils)
        router.push(`/groups/${group.slug}`)
      }}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
