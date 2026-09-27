'use client'

import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/auth/actions'
import { disconnectPushSubscription } from '@/lib/push/use-push-notification-subscription'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

export function SignOutButton() {
  const t = useTranslations('ProfileSettings')
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => {
      await disconnectPushSubscription()
      await logoutAction()
    })
  }

  return (
    <Button variant="outline" onClick={handleLogout} disabled={isPending}>
      {isPending ? t('signingOut') : t('signOut')}
    </Button>
  )
}
