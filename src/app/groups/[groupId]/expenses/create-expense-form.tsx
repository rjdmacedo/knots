'use client'
import { getDyadFriendUserId } from '@/lib/dyad-groups'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { trpc } from '@/trpc/client'
import { GroupType } from '@prisma/client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
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
  const t = useTranslations('Friends.Expenses')
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

  const isDyad = group.type === GroupType.DYAD
  const friendId = isDyad
    ? getDyadFriendUserId(group.participants, currentUserId)
    : undefined
  const friendExpensesUrl = friendId ? `/friends/${friendId}/expenses` : null

  return (
    <div className="flex flex-col gap-4">
      {friendExpensesUrl && (
        <Link
          href={friendExpensesUrl}
          className="text-sm text-muted-foreground hover:underline w-fit"
        >
          ← {t('backToFriend', { name: group.name })}
        </Link>
      )}
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
          if (friendId) {
            utils.friends.getExpenses.invalidate({ friendId })
          }
          invalidateActivityQueries(utils)
          router.push(friendExpensesUrl ?? `/groups/${group.id}`)
        }}
        runtimeFeatureFlags={runtimeFeatureFlags}
      />
    </div>
  )
}
