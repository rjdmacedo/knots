import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { redirect } from 'next/navigation'
import { GlobalActivityList } from './global-activity-list'

export const metadata: Metadata = {
  title: 'Activities',
}

export default async function ActivitiesPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/activities')
  }

  return <ActivitiesPageContent />
}

function ActivitiesPageContent() {
  const t = useTranslations('Activity')

  return (
    <>
      <h1 className="font-bold text-2xl">{t('globalTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('globalDescription')}</p>
      <GlobalActivityList />
    </>
  )
}
