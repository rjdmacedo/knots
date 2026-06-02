/**
 * Profile Service — handles user profile operations (name change, password change).
 * Uses existing auth utilities for password hashing/verification and validation.
 */

import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { validatePassword } from '@/lib/auth/password-validation'

export type ProfileError =
  | { code: 'INVALID_NAME'; message: string }
  | { code: 'CURRENT_PASSWORD_MISMATCH'; message: string }
  | { code: 'SAME_PASSWORD'; message: string }
  | { code: 'INVALID_PASSWORD'; message: string; errors: string[] }

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
  const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash)
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
