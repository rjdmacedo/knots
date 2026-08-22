/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Used for the in-process group email digest poller (self-hosted / Docker).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const { startGroupEmailDigestScheduler } =
    await import('@/lib/email/group-activity-digest-scheduler')
  startGroupEmailDigestScheduler()
}
