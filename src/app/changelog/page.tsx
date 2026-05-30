import { ChangelogContent } from '@/app/changelog/_components/changelog-content'
import { getChangelogEntries } from '@/lib/changelog'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'View the latest updates, new features, bug fixes, and improvements to Knots across all releases.',
  openGraph: {
    title: 'Changelog · Knots',
    description:
      'View the latest updates, new features, bug fixes, and improvements to Knots across all releases.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Changelog · Knots',
    description:
      'View the latest updates, new features, bug fixes, and improvements to Knots across all releases.',
  },
}

export default function ChangelogPage() {
  const entries = getChangelogEntries()

  return (
    <div className="container max-w-[var(--breakpoint-md)] py-8 md:py-12">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Changelog</h1>
      <ChangelogContent entries={entries} />
    </div>
  )
}
