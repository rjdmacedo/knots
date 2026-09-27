/**
 * Server Actions for NextAuth sign-in and sign-out.
 * Wraps NextAuth's signIn/signOut with rate limiting and error handling.
 */
'use server'

import { signIn, signOut } from './auth'
import { LOGIN_RATE_LIMIT, rateLimiter } from './rate-limiter'

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string; retryAfter?: Date }

/**
 * Server action for user login.
 * Checks rate limiting, then delegates to NextAuth signIn.
 * Returns a user-friendly error on failure — never reveals which field is wrong.
 */
export async function loginAction(formData: {
  email: string
  password: string
  redirectTo?: string
}): Promise<LoginResult> {
  const { email, password, redirectTo } = formData

  // Check rate limit before attempting login
  const rateLimitKey = `login:${email.toLowerCase()}`
  const rateLimitResult = await rateLimiter.checkLimit(
    rateLimitKey,
    LOGIN_RATE_LIMIT,
  )

  if (!rateLimitResult.allowed) {
    return {
      ok: false,
      error: 'Too many login attempts. Please try again later.',
      retryAfter: rateLimitResult.resetAt ?? undefined,
    }
  }

  // Record the attempt before trying to sign in
  await rateLimiter.recordAttempt(rateLimitKey, LOGIN_RATE_LIMIT)

  try {
    await signIn('credentials', {
      email,
      password,
      redirectTo: redirectTo || '/groups',
    })

    // signIn with redirect (default) will throw a NEXT_REDIRECT error
    // which Next.js handles as a redirect. If we reach here, it means
    // redirect: false was somehow in effect.
    return { ok: true }
  } catch (error) {
    // Next.js redirect throws a special error that must be re-thrown
    if (
      error instanceof Error &&
      'digest' in error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }

    // All auth failures return a generic message for security
    return {
      ok: false,
      error: 'Invalid email or password',
    }
  }
}

/**
 * Server action for passkey login.
 * Exchanges a single-use token (minted server-side by
 * `passkey.verifyAuthentication` after a verified WebAuthn ceremony) for a real
 * NextAuth session via the `passkey` provider. The session shape and
 * session-limit enforcement match a password login. Never accepts a raw userId.
 */
export async function passkeyLoginAction(formData: {
  token: string
  redirectTo?: string
}): Promise<LoginResult> {
  const { token, redirectTo } = formData

  try {
    await signIn('passkey', {
      token,
      redirectTo: redirectTo || '/groups',
    })

    return { ok: true }
  } catch (error) {
    // Next.js redirect throws a special error that must be re-thrown
    if (
      error instanceof Error &&
      'digest' in error &&
      typeof (error as { digest?: string }).digest === 'string' &&
      (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error
    }

    return {
      ok: false,
      error: 'We could not sign you in with that passkey. Try again.',
    }
  }
}

/**
 * Server action for user logout.
 * Invalidates the current session and redirects to the login page.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

/**
 * Recovery after an unrecoverable client error (e.g. stale session after a DB reseed).
 * Clears the auth session and redirects to the homepage.
 */
export async function recoverFromAppErrorAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
