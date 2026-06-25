import { CreateExpenseForm } from '@/app/groups/[groupId]/expenses/create-expense-form'
import { auth } from '@/lib/auth/auth'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Create Expense',
}

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const { groupId } = await params
  return (
    <CreateExpenseForm
      groupId={groupId}
      currentUserId={session.user.id}
      runtimeFeatureFlags={await getRuntimeFeatureFlags()}
    />
  )
}
