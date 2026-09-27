/**
 * Single-use, short-lived WebAuthn challenge storage, backed by the
 * `PasskeyChallenge` table.
 *
 * Sessions here are JWT-based and carry no server-side mutable state, so the
 * challenge lives in a row (design decision 6: "a short-lived challenge on the
 * session or a PasskeyChallenge row"). A registration/authentication challenge
 * is written when options are generated and *consumed* (deleted) the first time
 * it is read, so a captured challenge can never be replayed.
 *
 * The same table stores the "recent-auth" marker: `confirmRecentPassword`
 * writes a `recent-auth` row that expires after `RECENT_AUTH_WINDOW_MS`, and the
 * add-passkey gate checks whether an unexpired one exists.
 */
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/** WebAuthn ceremony challenges live for 5 minutes — long enough for a user to
 * complete a fingerprint/security-key prompt, short enough to limit replay. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** A passkey login token is exchanged for a session moments after a successful
 * ceremony, so it lives only 2 minutes and is consumed on first use. */
export const LOGIN_TOKEN_TTL_MS = 2 * 60 * 1000

/** A password confirmation stays "recent" for 5 minutes (design decision 6 /
 * requirement 7.4: the add gate triggers once the session is older than 5 min). */
export const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000

export type PasskeyChallengeType = 'registration' | 'authentication'

/**
 * Stores a fresh registration/authentication challenge for the given user,
 * replacing any previous challenge of the same type. Discoverable
 * authentication has no known user yet, so `userId` may be null.
 */
export async function saveChallenge(
  type: PasskeyChallengeType,
  challenge: string,
  userId: string | null,
): Promise<void> {
  await prisma.$transaction([
    // Only one live challenge of a type per user; a null-user (discoverable)
    // challenge is keyed solely by its unique challenge string.
    prisma.passkeyChallenge.deleteMany({
      where: userId ? { userId, type } : { type, userId: null },
    }),
    prisma.passkeyChallenge.create({
      data: {
        type,
        challenge,
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    }),
  ])
}

/**
 * Reads and consumes (deletes) the challenge string that matches `challenge`
 * for the given type. Returns null when no matching, unexpired, single-use
 * challenge exists — which the caller treats as a failed ceremony. Consuming on
 * read is what makes the challenge single-use.
 *
 * For user-scoped ceremonies (registration) pass `userId`; for discoverable
 * authentication pass null and the row is matched by challenge alone.
 */
export async function consumeChallenge(
  type: PasskeyChallengeType,
  challenge: string,
  userId: string | null,
): Promise<boolean> {
  const row = await prisma.passkeyChallenge.findFirst({
    where: userId ? { userId, type, challenge } : { type, challenge },
  })

  if (!row) return false

  // Always delete the matched row so it cannot be reused, even if expired.
  await prisma.passkeyChallenge.delete({ where: { id: row.id } })

  if (row.expiresAt.getTime() < Date.now()) {
    return false
  }

  return true
}

/**
 * Records that the user confirmed their password just now. Replaces any prior
 * marker so the 5-minute window always counts from the most recent confirm.
 */
export async function markRecentAuth(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.passkeyChallenge.deleteMany({
      where: { userId, type: 'recent-auth' },
    }),
    prisma.passkeyChallenge.create({
      data: {
        type: 'recent-auth',
        challenge: '',
        userId,
        expiresAt: new Date(Date.now() + RECENT_AUTH_WINDOW_MS),
      },
    }),
  ])
}

/**
 * Whether the user has confirmed their password within the recent-auth window.
 * The add-passkey flow uses this to decide if it must first ask for the
 * current password (requirement 7.4).
 */
export async function hasRecentAuth(userId: string): Promise<boolean> {
  const row = await prisma.passkeyChallenge.findFirst({
    where: {
      userId,
      type: 'recent-auth',
      expiresAt: { gt: new Date() },
    },
  })

  return row !== null
}

/** SHA-256 hex hash of a raw login token — only the hash is ever stored. */
function hashLoginToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Mints a single-use, short-lived login token proving that `userId` just
 * completed a WebAuthn authentication ceremony server-side. The raw token is
 * returned to the caller (never stored); only its hash lives in a
 * `passkey-login` row. The `passkey` NextAuth provider exchanges this token for
 * a session — the client never passes a raw userId, so a session can only be
 * created after server-side verification.
 *
 * Any prior login token for the user is replaced so only the most recent one
 * is live.
 */
export async function issueLoginToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const hash = hashLoginToken(rawToken)

  await prisma.$transaction([
    prisma.passkeyChallenge.deleteMany({
      where: { userId, type: 'passkey-login' },
    }),
    prisma.passkeyChallenge.create({
      data: {
        type: 'passkey-login',
        challenge: hash,
        userId,
        expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
      },
    }),
  ])

  return rawToken
}

/**
 * Validates and consumes (deletes) a passkey login token. Returns the owning
 * user id when the token matches an unexpired, unused row, otherwise null. The
 * row is always deleted on a match so the token cannot be replayed.
 */
export async function consumeLoginToken(
  rawToken: string,
): Promise<string | null> {
  const hash = hashLoginToken(rawToken)

  const row = await prisma.passkeyChallenge.findFirst({
    where: { type: 'passkey-login', challenge: hash },
  })

  if (!row || !row.userId) return null

  // Always delete the matched row so it cannot be reused, even if expired.
  await prisma.passkeyChallenge.delete({ where: { id: row.id } })

  if (row.expiresAt.getTime() < Date.now()) {
    return null
  }

  return row.userId
}
