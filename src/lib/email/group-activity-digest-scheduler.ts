import 'server-only'

import { processDueGroupEmailDigests } from '@/lib/email/group-activity-digest'

const DEFAULT_INTERVAL_MS = 60_000

let started = false
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Poll for due group email digests on a long-lived Node process (Docker / next start).
 * Safe to call multiple times — only one interval is armed.
 */
export function startGroupEmailDigestScheduler(
  intervalMs = DEFAULT_INTERVAL_MS,
): void {
  if (started) {
    return
  }
  started = true

  const tick = () => {
    processDueGroupEmailDigests().catch((error) => {
      console.error('[email-digest] Scheduler tick failed:', error)
    })
  }

  // First pass shortly after boot so pending digests from downtime are flushed.
  setTimeout(tick, 5_000)
  timer = setInterval(tick, intervalMs)
  // Do not keep the process alive solely for this timer (useful in tests).
  if (typeof timer.unref === 'function') {
    timer.unref()
  }
}
