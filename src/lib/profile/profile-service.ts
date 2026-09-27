/**
 * Profile Service — handles user profile operations (name change, password change,
 * preferences, blocked users, sign out all devices).
 * Uses existing auth utilities for password hashing/verification and validation.
 */

import type { Locale } from '@/i18n'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { validatePassword } from '@/lib/auth/password-validation'
import { prisma } from '@/lib/prisma'
import {
  ImageStorageUnavailableError,
  deleteProfileImage,
  isImageStorageConfigured,
  presignProfileImage,
  resolveIssuedImageUrl,
  type PresignedProfileImage,
} from '@/lib/profile/profile-image'

export type Theme = 'light' | 'dark' | 'system'

export type ProfileError =
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'CURRENT_PASSWORD_MISMATCH'; message: string }
  | { code: 'SAME_PASSWORD'; message: string }
  | { code: 'NO_ALTERNATIVE_SIGN_IN'; message: string }
  | { code: 'INVALID_PASSWORD'; message: string; errors: string[] }
  | { code: 'USER_NOT_FOUND'; message: string }
  | { code: 'CANNOT_BLOCK_SELF'; message: string }
  | { code: 'ALREADY_BLOCKED'; message: string }
  | { code: 'NOT_BLOCKED'; message: string }
  | { code: 'IMAGE_STORAGE_UNAVAILABLE'; message: string }
  | { code: 'INVALID_IMAGE_KEY'; message: string }
  | { code: 'UNSUPPORTED_IMAGE_TYPE'; message: string }

type ProfileResult<T = void> =
  | { ok: true; value?: T }
  | { ok: false; error: ProfileError }

const MIN_NAME_LENGTH = 1
const MAX_NAME_LENGTH = 100

/**
 * Changes the user's display name.
 * Trims whitespace and validates length (1–100 chars after trim).
 */
export async function changeName(
  userId: string,
  newName: string,
): Promise<ProfileResult> {
  const trimmed = newName.trim()

  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: {
        code: 'INVALID_NAME',
        message: `Name must be between ${MIN_NAME_LENGTH} and ${MAX_NAME_LENGTH} characters after trimming`,
      },
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name: trimmed },
  })

  return { ok: true }
}

/**
 * Changes the user's password.
 * Verifies current password, validates new password, rejects same-password,
 * hashes new password, updates DB, and invalidates all other sessions.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string,
): Promise<ProfileResult> {
  // Fetch the user's current password hash
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (!user) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'User not found',
      },
    }
  }

  // Accounts with no password cannot verify a current password
  if (!user.passwordHash) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  // Verify current password
  const isCurrentValid = await verifyPassword(
    currentPassword,
    user.passwordHash,
  )
  if (!isCurrentValid) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  // Reject same password
  const isSamePassword = await verifyPassword(newPassword, user.passwordHash)
  if (isSamePassword) {
    return {
      ok: false,
      error: {
        code: 'SAME_PASSWORD',
        message: 'New password must be different from the current password',
      },
    }
  }

  // Validate new password strength
  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'New password does not meet requirements',
        errors: validation.errors,
      },
    }
  }

  // Hash new password and update
  const newHash = await hashPassword(newPassword)

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  })

  // Invalidate all other sessions for this user
  const deleteWhere: { userId: string; id?: { not: string } } = { userId }
  if (currentSessionId) {
    deleteWhere.id = { not: currentSessionId }
  }

  await prisma.session.deleteMany({
    where: deleteWhere,
  })

  return { ok: true }
}

/**
 * Sets a password on an account that does not have one (passkey-only sign-in).
 * Refuses when a hash already exists so this cannot replace `changePassword`.
 */
export async function setPassword(
  userId: string,
  newPassword: string,
): Promise<ProfileResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (!user) {
    return {
      ok: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    }
  }

  if (user.passwordHash) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'This account already has a password',
        errors: [],
      },
    }
  }

  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: 'New password does not meet requirements',
        errors: validation.errors,
      },
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  return { ok: true }
}

/**
 * Removes the user's password so they sign in with a passkey instead.
 * Verifies the current password, then refuses when the user has no passkey —
 * clearing the hash would otherwise leave the account with no sign-in method.
 * On success sets `passwordHash` to null; credentials sign-in then treats the
 * account as invalid credentials, leaving passkey sign-in as the other path.
 */
export async function removePassword(
  userId: string,
  currentPassword: string,
): Promise<ProfileResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  // Verify current password. A missing user or null hash cannot verify, and we
  // return the same mismatch error so the response never reveals which it was.
  if (!user || !user.passwordHash) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  const isCurrentValid = await verifyPassword(
    currentPassword,
    user.passwordHash,
  )
  if (!isCurrentValid) {
    return {
      ok: false,
      error: {
        code: 'CURRENT_PASSWORD_MISMATCH',
        message: 'Current password is incorrect',
      },
    }
  }

  // Refuse to remove the password when it is the only sign-in method.
  const passkeyCount = await prisma.passkey.count({ where: { userId } })
  if (passkeyCount === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_ALTERNATIVE_SIGN_IN',
        message: 'Add a passkey before removing your password',
      },
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: null },
  })

  return { ok: true }
}

/**
 * Updates user preferences (timezone, preferred currency, locale, theme).
 */
export async function changePreferences(
  userId: string,
  preferences: {
    timezone?: string
    preferredCurrency?: string
    locale?: Locale
    theme?: Theme
  },
): Promise<ProfileResult> {
  const data: {
    timezone?: string
    preferredCurrency?: string
    locale?: string
    theme?: string
  } = {}

  if (preferences.timezone !== undefined) {
    data.timezone = preferences.timezone
  }

  if (preferences.preferredCurrency !== undefined) {
    data.preferredCurrency = preferences.preferredCurrency
  }

  if (preferences.locale !== undefined) {
    data.locale = preferences.locale
  }

  if (preferences.theme !== undefined) {
    data.theme = preferences.theme
  }

  await prisma.user.update({
    where: { id: userId },
    data,
  })

  return { ok: true }
}

/**
 * Signs out all devices by deleting all sessions for this user.
 */
export async function signOutAllDevices(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),
  ])
}

/**
 * Returns a list of users blocked by the given user.
 */
export async function getBlockedUsers(userId: string) {
  const blockedEntries = await prisma.blockedUser.findMany({
    where: { userId },
    include: {
      blockedUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return blockedEntries.map((entry) => ({
    id: entry.id,
    blockedEmail: entry.blockedEmail,
    blockedUserId: entry.blockedUser?.id ?? null,
    name: entry.blockedUser?.name ?? entry.blockedEmail.split('@')[0],
    email: entry.blockedEmail,
    createdAt: entry.createdAt,
  }))
}

/**
 * Blocks a user by their email address.
 * The target does not need to have an account — supports soft-blocking.
 * If the target is a friend, the friendship is automatically removed.
 */
export async function blockUser(
  userId: string,
  email: string,
): Promise<ProfileResult> {
  const normalizedEmail = email.toLowerCase().trim()

  // Check the blocker's own email to prevent self-block
  const self = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (self && self.email.toLowerCase() === normalizedEmail) {
    return {
      ok: false,
      error: {
        code: 'CANNOT_BLOCK_SELF',
        message: 'You cannot block yourself',
      },
    }
  }

  // Check if already blocked
  const existing = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedEmail: { userId, blockedEmail: normalizedEmail },
    },
  })

  if (existing) {
    return {
      ok: false,
      error: {
        code: 'ALREADY_BLOCKED',
        message: 'This user is already blocked',
      },
    }
  }

  // Resolve target user if they exist
  const targetUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  })

  // Create the block entry
  await prisma.blockedUser.create({
    data: {
      userId,
      blockedEmail: normalizedEmail,
      blockedUserId: targetUser?.id ?? null,
    },
  })

  // Remove the friendship if it exists (both directions)
  await prisma.friend.deleteMany({
    where: {
      OR: [
        { userId, email: normalizedEmail },
        ...(targetUser
          ? [{ userId: targetUser.id, friendUserId: userId }]
          : []),
      ],
    },
  })

  return { ok: true }
}

/**
 * Unblocks a user by the block entry's blocked email.
 */
export async function unblockUser(
  userId: string,
  blockedEmail: string,
): Promise<ProfileResult> {
  const normalizedEmail = blockedEmail.toLowerCase().trim()

  const existing = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedEmail: { userId, blockedEmail: normalizedEmail },
    },
  })

  if (!existing) {
    return {
      ok: false,
      error: {
        code: 'NOT_BLOCKED',
        message: 'This user is not blocked',
      },
    }
  }

  await prisma.blockedUser.delete({
    where: {
      userId_blockedEmail: { userId, blockedEmail: normalizedEmail },
    },
  })

  return { ok: true }
}

/** Content types accepted for a profile image upload. */
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Presigns a profile image upload. Reuses the shared S3 client and bucket and
 * returns a signed key that {@link setImage} will accept. Fails with
 * `IMAGE_STORAGE_UNAVAILABLE` when object storage is not configured.
 */
export async function presignImage(
  userId: string,
  contentType: string,
): Promise<ProfileResult<PresignedProfileImage>> {
  if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_IMAGE_TYPE',
        message: 'Unsupported image type',
      },
    }
  }

  try {
    const presigned = await presignProfileImage(userId, contentType)
    return { ok: true, value: presigned }
  } catch (error) {
    if (error instanceof ImageStorageUnavailableError) {
      return {
        ok: false,
        error: { code: 'IMAGE_STORAGE_UNAVAILABLE', message: error.message },
      }
    }
    throw error
  }
}

/**
 * Sets the user's profile image from a key this app's presign just issued.
 * Rejects any key/signature pair that was not issued by {@link presignImage}
 * for this user, so `User.image` can never point at an arbitrary external URL.
 * Deletes the previously stored image on success (best effort).
 */
export async function setImage(
  userId: string,
  key: string,
  signature: string,
): Promise<ProfileResult<{ image: string }>> {
  let imageUrl: string | null
  try {
    imageUrl = resolveIssuedImageUrl(userId, key, signature)
  } catch (error) {
    if (error instanceof ImageStorageUnavailableError) {
      return {
        ok: false,
        error: { code: 'IMAGE_STORAGE_UNAVAILABLE', message: error.message },
      }
    }
    throw error
  }

  if (!imageUrl) {
    return {
      ok: false,
      error: {
        code: 'INVALID_IMAGE_KEY',
        message: 'Image key was not issued for this account',
      },
    }
  }

  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  })

  await prisma.user.update({
    where: { id: userId },
    data: { image: imageUrl },
  })

  // Best-effort cleanup of the replaced object; never fail the mutation on it.
  if (previous?.image && previous.image !== imageUrl) {
    await deleteProfileImage(previous.image).catch((error) => {
      console.error('Failed to delete previous profile image:', error)
    })
  }

  return { ok: true, value: { image: imageUrl } }
}

/**
 * Removes the user's profile image: deletes the stored object and clears
 * `User.image`. Fails with `IMAGE_STORAGE_UNAVAILABLE` when storage is not
 * configured, so the UI can show the same unavailable state as choose.
 */
export async function removeImage(userId: string): Promise<ProfileResult> {
  if (!isImageStorageConfigured()) {
    return {
      ok: false,
      error: {
        code: 'IMAGE_STORAGE_UNAVAILABLE',
        message: 'Image storage is not configured',
      },
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  })

  if (user?.image) {
    await deleteProfileImage(user.image).catch((error) => {
      console.error('Failed to delete profile image:', error)
    })
  }

  await prisma.user.update({
    where: { id: userId },
    data: { image: null },
  })

  return { ok: true }
}
