'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { logoutAction } from '@/lib/auth/actions'
import { disconnectPushSubscription } from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'

export function SignOutAllButton() {
  const t = useTranslations('ProfileSettings.SignOutAll')
  const [isPending, startTransition] = useTransition()

  const signOutAll = trpc.profile.signOutAllDevices.useMutation()

  function handleConfirm() {
    startTransition(async () => {
      try {
        await disconnectPushSubscription().catch(() => {})
        await signOutAll.mutateAsync()
        await logoutAction()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    })
  }

  const busy = isPending || signOutAll.isPending

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        {t('button')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dialogTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dialogDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('signingOut')}
              </>
            ) : (
              t('confirm')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
