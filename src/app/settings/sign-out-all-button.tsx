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
import { trpc } from '@/trpc/client'
import { Loader2, MonitorSmartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function SignOutAllButton() {
  const t = useTranslations('ProfileSettings.SignOutAll')
  const router = useRouter()

  const signOutAll = trpc.profile.signOutAllDevices.useMutation({
    onSuccess: () => {
      toast.success(t('successToast'))
      // Sessions are invalidated server-side; redirect to login
      router.push('/login')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" className="w-full sm:w-auto" />}
      >
        <MonitorSmartphone className="size-4" />
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
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => signOutAll.mutate()}
            disabled={signOutAll.isPending}
          >
            {signOutAll.isPending ? (
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
