/**
 * Passkey (WebAuthn) server module.
 *
 * Wraps `@simplewebauthn/server` for the registration and authentication
 * ceremonies and owns the passkey list/rename/delete queries. Challenges are
 * single-use and short-lived (see `./challenge-store`). rpID and origin come
 * from the app URL (see `./config`) and every verification checks the
 * response's origin and rpID.
 *
 * Design references: decision 6 ("Passkeys use @simplewebauthn/server"),
 * requirements 7.3 (registration/authentication ceremonies), 7.7 (delete
 * refuses the last sign-in method).
 */
import { verifyPassword } from '@/lib/auth/password'
import { isSessionFresh } from '@/lib/auth/session-freshness'
import { prisma } from '@/lib/prisma'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import {
  generateAuthenticationOptions as swaGenerateAuthenticationOptions,
  generateRegistrationOptions as swaGenerateRegistrationOptions,
  verifyAuthenticationResponse as swaVerifyAuthenticationResponse,
  verifyRegistrationResponse as swaVerifyRegistrationResponse,
} from '@simplewebauthn/server'
import {
  consumeChallenge,
  consumeLoginToken,
  hasRecentAuth,
  issueLoginToken,
  markRecentAuth,
  saveChallenge,
} from './challenge-store'
import { getExpectedOrigin, getRpID, getRpName } from './config'

export type PasskeyError =
  | { code: 'USER_NOT_FOUND'; message: string }
  | { code: 'VERIFICATION_FAILED'; message: string }
  | { code: 'CREDENTIAL_NOT_FOUND'; message: string }
  | { code: 'PASSKEY_NOT_FOUND'; message: string }
  | { code: 'LAST_SIGN_IN_METHOD'; message: string }
  | { code: 'CURRENT_PASSWORD_MISMATCH'; message: string }
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'SESSION_NOT_FRESH'; message: string }

export type PasskeyResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: PasskeyError }

const MAX_PASSKEY_NAME_LENGTH = 100

/**
 * A stored passkey, shaped for the settings list. `credentialId` is the
 * base64url credential id; `publicKey` is never returned to the client.
 */
export interface PasskeySummary {
  id: string
  name: string
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  createdAt: Date
}

/**
 * Converts a Prisma `Bytes` column to the `Uint8Array` the library expects.
 * Copies into a fresh `ArrayBuffer`-backed view so the type is the concrete
 * `Uint8Array<ArrayBuffer>` `@simplewebauthn/server` requires (its stored value
 * may otherwise be backed by a `SharedArrayBuffer`/pooled Node `Buffer`).
 */
function toUint8Array(bytes: Uint8Array | Buffer): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy
}

/**
 * Builds the registration options for a WebAuthn ceremony and stores the
 * challenge. `excludeCredentials` prevents registering the same authenticator
 * twice. The user's display name defaults to the account name.
 */
export async function generateRegistrationOptions(
  userId: string,
  authTime?: number | null,
): Promise<PasskeyResult<PublicKeyCredentialCreationOptionsJSON>> {
  if (!isSessionFresh(authTime)) {
    return {
      ok: false,
      error: { code: 'SESSION_NOT_FRESH', message: 'SESSION_NOT_FRESH' },
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })

  if (!user) {
    return {
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: 'Session expired.' },
    }
  }

  const existing = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true },
  })

  const options = await swaGenerateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpID(),
    // WebAuthn user handle must be bytes; the account id is a stable identifier.
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  await saveChallenge('registration', options.challenge, userId)

  return { ok: true, value: options }
}

/**
 * Verifies a registration response against the stored challenge, then persists
 * the credential (credentialId, publicKey, counter, deviceType from the
 * authenticator attachment, backedUp). The stored name falls back to the
 * account display name when the dialog nickname is blank. Origin and rpID are
 * checked against the app URL.
 */
export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name?: string,
  authTime?: number | null,
): Promise<PasskeyResult<PasskeySummary>> {
  if (!isSessionFresh(authTime)) {
    return {
      ok: false,
      error: { code: 'SESSION_NOT_FRESH', message: 'SESSION_NOT_FRESH' },
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })

  if (!user) {
    return {
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: 'Session expired.' },
    }
  }

  const challengeOk = await consumeChallenge(
    'registration',
    response.response.clientDataJSON
      ? decodeChallengeFromClientData(response.response.clientDataJSON)
      : '',
    userId,
  )

  if (!challengeOk) {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'The passkey challenge expired. Try again.',
      },
    }
  }

  let verification
  try {
    verification = await swaVerifyRegistrationResponse({
      response,
      expectedChallenge: decodeChallengeFromClientData(
        response.response.clientDataJSON,
      ),
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      requireUserVerification: false,
    })
  } catch {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'We could not verify that passkey. Try again.',
      },
    }
  }

  if (!verification.verified || !verification.registrationInfo) {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'We could not verify that passkey. Try again.',
      },
    }
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo

  const trimmedName = name?.trim()
  const finalName =
    trimmedName && trimmedName.length > 0
      ? trimmedName.slice(0, MAX_PASSKEY_NAME_LENGTH)
      : user.name

  const created = await prisma.passkey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: finalName,
    },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
    },
  })

  return {
    ok: true,
    value: {
      id: created.id,
      name: created.name,
      deviceType: created.deviceType as 'singleDevice' | 'multiDevice',
      backedUp: created.backedUp,
      createdAt: created.createdAt,
    },
  }
}

/**
 * Builds authentication options for a discoverable (usernameless) ceremony —
 * no email or `allowCredentials`, so the authenticator offers whichever
 * resident credential it holds for this rpID. Stores the challenge.
 */
export async function generateAuthenticationOptions(): Promise<
  PasskeyResult<PublicKeyCredentialRequestOptionsJSON>
> {
  const options = await swaGenerateAuthenticationOptions({
    rpID: getRpID(),
    userVerification: 'preferred',
    // Discoverable: no allowCredentials, so the browser resolves the user.
  })

  await saveChallenge('authentication', options.challenge, null)

  return { ok: true, value: options }
}

/**
 * Verifies an authentication response against the stored credential and
 * consumes the challenge. Looks the credential up by its id, checks origin and
 * rpID, then advances the stored signature counter to guard against cloned
 * authenticators. Returns the owning user id together with a single-use,
 * short-lived `loginToken` the sign-in flow exchanges for a real session — the
 * client never gets to assert a userId directly.
 */
export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
): Promise<PasskeyResult<{ userId: string; loginToken: string }>> {
  const challenge = decodeChallengeFromClientData(
    response.response.clientDataJSON,
  )
  const challengeOk = await consumeChallenge('authentication', challenge, null)

  if (!challengeOk) {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'The passkey challenge expired. Try again.',
      },
    }
  }

  const stored = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    select: {
      id: true,
      userId: true,
      credentialId: true,
      publicKey: true,
      counter: true,
    },
  })

  if (!stored) {
    return {
      ok: false,
      error: {
        code: 'CREDENTIAL_NOT_FOUND',
        message: 'That passkey is not registered.',
      },
    }
  }

  let verification
  try {
    verification = await swaVerifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: toUint8Array(stored.publicKey),
        counter: stored.counter,
      },
    })
  } catch {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'We could not verify that passkey. Try again.',
      },
    }
  }

  if (!verification.verified) {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'We could not verify that passkey. Try again.',
      },
    }
  }

  // Persist the advanced counter so a replayed (cloned) assertion is rejected.
  await prisma.passkey.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter },
  })

  // Mint the single-use bridge token the `passkey` sign-in provider consumes.
  const loginToken = await issueLoginToken(stored.userId)

  return { ok: true, value: { userId: stored.userId, loginToken } }
}

/**
 * Validates and consumes a passkey login token, returning the user to sign in
 * (id, name, email, emailVerified) in the same shape the credentials provider
 * returns. Called by the `passkey` NextAuth Credentials provider's `authorize`.
 * The token is single-use and short-lived (see `issueLoginToken`), so a session
 * is only ever created after a completed, server-verified WebAuthn ceremony.
 */
export async function consumePasskeyLoginToken(token: string): Promise<
  PasskeyResult<{
    id: string
    name: string
    email: string
    emailVerified: Date | null
  }>
> {
  const userId = await consumeLoginToken(token)

  if (!userId) {
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'That passkey sign-in expired. Try again.',
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerified: true },
  })

  if (!user) {
    return {
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: 'Account not found.' },
    }
  }

  return {
    ok: true,
    value: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    },
  }
}

/** Lists the user's passkeys for the settings list, newest first. */
export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
  const rows = await prisma.passkey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
    },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    deviceType: row.deviceType as 'singleDevice' | 'multiDevice',
    backedUp: row.backedUp,
    createdAt: row.createdAt,
  }))
}

/** Renames a passkey the user owns. Rejects a blank or too-long name. */
export async function renamePasskey(
  userId: string,
  passkeyId: string,
  name: string,
): Promise<PasskeyResult<PasskeySummary>> {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PASSKEY_NAME_LENGTH) {
    return {
      ok: false,
      error: {
        code: 'INVALID_NAME',
        message: `Name must be between 1 and ${MAX_PASSKEY_NAME_LENGTH} characters.`,
      },
    }
  }

  const existing = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
    select: { id: true },
  })

  if (!existing) {
    return {
      ok: false,
      error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found.' },
    }
  }

  const updated = await prisma.passkey.update({
    where: { id: passkeyId },
    data: { name: trimmed },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
    },
  })

  return {
    ok: true,
    value: {
      id: updated.id,
      name: updated.name,
      deviceType: updated.deviceType as 'singleDevice' | 'multiDevice',
      backedUp: updated.backedUp,
      createdAt: updated.createdAt,
    },
  }
}

/**
 * Deletes a passkey the user owns. Refuses when it is the user's last passkey
 * and the account has neither a password nor a verified email — that would
 * leave the user with no way to sign in.
 */
export async function deletePasskey(
  userId: string,
  passkeyId: string,
): Promise<PasskeyResult> {
  const existing = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
    select: { id: true },
  })

  if (!existing) {
    return {
      ok: false,
      error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found.' },
    }
  }

  const [passkeyCount, user] = await Promise.all([
    prisma.passkey.count({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, emailVerified: true },
    }),
  ])

  const isLastPasskey = passkeyCount <= 1
  const hasAlternative =
    Boolean(user?.passwordHash) || user?.emailVerified != null

  if (isLastPasskey && !hasAlternative) {
    return {
      ok: false,
      error: {
        code: 'LAST_SIGN_IN_METHOD',
        message:
          'This is your only sign-in method. Verify your email or set a password before removing it.',
      },
    }
  }

  await prisma.passkey.delete({ where: { id: passkeyId } })

  return { ok: true, value: undefined }
}

/**
 * Confirms the user's current password and refreshes the recent-auth marker
 * the 5-minute add-passkey gate reads (requirement 7.4). Returns the generic
 * mismatch error for a missing user or null hash so the response never reveals
 * whether the account has a password.
 */
export async function confirmRecentPassword(
  userId: string,
  currentPassword: string,
): Promise<PasskeyResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (!user || !user.passwordHash) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash)
  if (!isValid) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  await markRecentAuth(userId)

  return { ok: true, value: undefined }
}

/** Re-exported so callers can gate the add flow without importing the store. */
export { hasRecentAuth }

/**
 * Extracts the base64url challenge from a WebAuthn `clientDataJSON` blob. The
 * blob is itself base64url-encoded JSON: `{ type, challenge, origin, ... }`.
 * Returns an empty string when it cannot be parsed, which fails verification.
 */
function decodeChallengeFromClientData(clientDataJSON: string): string {
  try {
    const json = Buffer.from(clientDataJSON, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as { challenge?: string }
    return parsed.challenge ?? ''
  } catch {
    return ''
  }
}
