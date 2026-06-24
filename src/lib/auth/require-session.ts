import { auth, signOut } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'

type RequireSessionOptions = {
  callbackUrl?: string
  staleRedirectTo?: string
}

/**
 * Ensures the request has a valid session backed by an existing user.
 * Redirects to login when unauthenticated, or signs out and redirects when stale.
 */
export async function requireSession(options: RequireSessionOptions = {}) {
  const session = await auth()

  if (!session?.user?.id) {
    const loginUrl = options.callbackUrl
      ? `/login?callbackUrl=${encodeURIComponent(options.callbackUrl)}`
      : '/login'
    redirect(loginUrl)
  }

  return session
}

/**
 * Like requireSession, but also clears stale JWT cookies when the user no longer exists.
 * Use on server pages that would otherwise crash after a DB reseed.
 */
export async function requireSessionOrRecover(
  options: RequireSessionOptions = {},
) {
  const session = await auth()

  if (!session?.user?.id) {
    await signOut({ redirectTo: options.staleRedirectTo ?? '/' })
  }

  return session
}
