'use client'

import { Button } from '@/components/ui/button'
import { isStaleSessionError } from '@/lib/auth/session-user'
import { clearAppClientState } from '@/lib/clear-client-state'
import { recoverFromAppError } from '@/lib/recover-from-app-error'
import { trpcClient } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useTransition } from 'react'

type AppErrorProps = {
  error: Error & { digest?: string }
}

export function AppError({ error }: AppErrorProps) {
  const t = useTranslations('AppError')
  const [isRecovering, startRecovery] = useTransition()
  const hasAutoRecovered = useRef(false)

  useEffect(() => {
    clearAppClientState()
    trpcClient.clear()
    console.error(error)

    if (isStaleSessionError(error) && !hasAutoRecovered.current) {
      hasAutoRecovered.current = true
      void recoverFromAppError()
    }
  }, [error])

  function handleRecover() {
    startRecovery(async () => {
      await recoverFromAppError()
    })
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
      <div>
        <Button onClick={handleRecover} disabled={isRecovering}>
          {isRecovering ? t('recovering') : t('recover')}
        </Button>
      </div>
    </div>
  )
}
