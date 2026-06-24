'use client'

import { recoverFromAppError } from '@/lib/recover-from-app-error'

let isRecovering = false

/** Clears stale client state and signs out after a 401 from tRPC. */
export function handleUnauthorizedClient(): void {
  if (isRecovering || typeof window === 'undefined') return
  isRecovering = true
  void recoverFromAppError()
}
