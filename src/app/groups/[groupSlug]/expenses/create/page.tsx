import { cached } from '@/app/cached-functions'
import { CreateExpenseForm } from '@/app/groups/[groupSlug]/expenses/create-expense-form'
import { auth } from '@/lib/auth/auth'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Create Expense',
}

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const { groupSlug } = await params
  const group = await cached.getGroupBySlug(groupSlug)

  if (!group) {
    notFound()
  }

  return (
    <CreateExpenseForm
      groupId={group.id}
      currentUserId={session.user.id}
      runtimeFeatureFlags={await getRuntimeFeatureFlags()}
    />
  )
}
