/** How long a sign-in stays fresh enough to add a passkey. Matches a 30-day window. */
export const SESSION_FRESH_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A session is fresh when `authTime` was recorded at sign-in and is still
 * inside the window. Missing or non-numeric values are not fresh.
 */
export function isSessionFresh(
  authTime: number | null | undefined,
  now = Date.now(),
): boolean {
  if (authTime == null || !Number.isFinite(authTime)) return false
  return now - authTime < SESSION_FRESH_AGE_MS
}
