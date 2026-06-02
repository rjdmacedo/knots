import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { redirect } from 'next/navigation'
import { FriendsManagement } from './friends-management'

export const metadata: Metadata = {
  title: 'Friends',
}

export default async function FriendsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/friends')
  }

  return <FriendsPageContent />
}

function FriendsPageContent() {
  const t = useTranslations('Friends')

  return (
    <>
      <h1 className="font-bold text-2xl">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <FriendsManagement />
    </>
  )
}
