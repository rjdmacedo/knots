import { ActivityPageClient } from '@/app/groups/[groupSlug]/activity/page.client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Activity',
}

export default async function ActivityPage() {
  return <ActivityPageClient />
}
