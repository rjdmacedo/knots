'use client'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { trpc } from '@/trpc/client'
import { useRouter } from 'next/navigation'
import { ExpenseForm } from './expense-form'

export function CreateExpenseForm({
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

  const { data: profile, isLoading: isProfileLoading } =
    trpc.profile.getProfile.useQuery()

  const { mutateAsync: createExpenseMutateAsync } =
    trpc.groups.expenses.create.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()

  if (!group || !categories || isProfileLoading) return null

  return (
    <div className="flex flex-col gap-4">
      <ExpenseForm
        group={group}
        categories={categories}
        currentUserId={currentUserId}
        preferredCurrency={profile?.preferredCurrency}
        onSubmit={async (expenseFormValues) => {
          await createExpenseMutateAsync({
            groupId,
            expenseFormValues,
          })
          utils.groups.expenses.invalidate()
          invalidateActivityQueries(utils)
          router.push(`/groups/${group.id}`)
        }}
        runtimeFeatureFlags={runtimeFeatureFlags}
      />
    </div>
  )
}
