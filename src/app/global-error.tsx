'use client'

import { isStaleSessionError } from '@/lib/auth/session-user'
import { clearAppClientState } from '@/lib/clear-client-state'
import { recoverFromAppError } from '@/lib/recover-from-app-error'
import { useEffect, useRef, useState } from 'react'
import './globals.css'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isRecovering, setIsRecovering] = useState(false)
  const hasAutoRecovered = useRef(false)

  useEffect(() => {
    clearAppClientState()
    console.error(error)

    if (isStaleSessionError(error) && !hasAutoRecovered.current) {
      hasAutoRecovered.current = true
      void recoverFromAppError()
    }
  }, [error])

  async function handleRecover() {
    setIsRecovering(true)
    await recoverFromAppError()
  }

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 font-sans text-foreground">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Local app data and your session will be cleared. You will be sent to
          the homepage.
        </p>
        <button
          type="button"
          onClick={() => void handleRecover()}
          disabled={isRecovering}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          {isRecovering ? 'Redirecting…' : 'Go to homepage'}
        </button>
      </body>
    </html>
  )
}
