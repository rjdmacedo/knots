import { NewGroupExpensePageClient } from '@/app/groups/[groupId]/expenses/new/page.client'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'

type Props = {
  params: Promise<{ groupId: string }>
}

export const metadata: Metadata = {
  title: 'New expense',
}

export default async function NewGroupExpensePage({ params }: Props) {
  const { groupId } = await params
  const runtimeFeatureFlags = await getRuntimeFeatureFlags()

  return (
    <NewGroupExpensePageClient
      groupId={groupId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
