/**
 * Profile Service — handles user profile operations (name change, password change,
 * preferences, blocked users, sign out all devices).
 * Uses existing auth utilities for password hashing/verification and validation.
 */

import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { validatePassword } from '@/lib/auth/password-validation'
import { prisma } from '@/lib/prisma'

export type ProfileError =
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'CURRENT_PASSWORD_MISMATCH'; message: string }
  | { code: 'SAME_PASSWORD'; message: string }
  | { code: 'INVALID_PASSWORD'; message: string; errors: string[] }
  | { code: 'USER_NOT_FOUND'; message: string }
  | { code: 'CANNOT_BLOCK_SELF'; message: string }
  | { code: 'ALREADY_BLOCKED'; message: string }
  | { code: 'NOT_BLOCKED'; message: string }

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
 * Updates user preferences (timezone, preferred currency).
 */
export async function changePreferences(
  userId: string,
  preferences: { timezone?: string; preferredCurrency?: string },
): Promise<ProfileResult> {
  const data: { timezone?: string; preferredCurrency?: string } = {}

  if (preferences.timezone !== undefined) {
    data.timezone = preferences.timezone
  }

  if (preferences.preferredCurrency !== undefined) {
    data.preferredCurrency = preferences.preferredCurrency
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
  await prisma.session.deleteMany({
    where: { userId },
  })
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
