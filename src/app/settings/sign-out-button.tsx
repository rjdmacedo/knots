'use client'

import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/auth/actions'
import { LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

export function SignOutButton() {
  const t = useTranslations('ProfileSettings')
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <Button
      variant="outline"
      onClick={handleLogout}
      disabled={isPending}
      className="w-full sm:w-auto"
    >
      <LogOut className="size-4" />
      {isPending ? t('signingOut') : t('signOut')}
    </Button>
  )
}
