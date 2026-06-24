'use client'

import { recoverFromAppErrorAction } from '@/lib/auth/actions'
import { clearAppClientState } from '@/lib/clear-client-state'
import { trpcClient } from '@/trpc/client'

/**
 * Clears client state, ends the auth session, and navigates to the homepage.
 * Falls back to a hard redirect if sign-out fails (e.g. corrupt session cookie).
 */
export async function recoverFromAppError(): Promise<void> {
  clearAppClientState()
  trpcClient.clear()

  try {
    await recoverFromAppErrorAction()
  } catch (error) {
    if (
      error instanceof Error &&
      'digest' in error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }

    window.location.assign('/')
  }
}
