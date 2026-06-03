'use client'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { trpc } from '@/trpc/client'
import { useRouter } from 'next/navigation'
import { ExpenseFormV2 } from './expense-form-v2'

export function CreateExpenseFormV2({
  groupId,
  currentUserId,
  runtimeFeatureFlags,
}: {
  groupId: string
  currentUserId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const { mutateAsync: createExpenseMutateAsync } =
    trpc.groups.expenses.create.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()

  if (!group || !categories) return null

  return (
    <ExpenseFormV2
      group={group}
      categories={categories}
      currentUserId={currentUserId}
      onSubmit={async (expenseFormValues, participantId) => {
        await createExpenseMutateAsync({
          groupId,
          expenseFormValues,
        })
        utils.groups.expenses.invalidate()
        utils.groups.activities.invalidate()
        router.push(`/groups/${group.id}`)
      }}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
