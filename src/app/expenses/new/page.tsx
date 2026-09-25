import { StandaloneExpenseCreate } from '@/app/expenses/new/page.client'
import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New expense',
}

export default async function StandaloneExpenseNewPage() {
  const runtimeFeatureFlags = await getRuntimeFeatureFlags()

  return <StandaloneExpenseCreate runtimeFeatureFlags={runtimeFeatureFlags} />
}
