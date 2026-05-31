/**
 * Password utilities: validation, hashing, and verification.
 * Uses bcrypt for hashing with unique salts.
 *
 * NOTE: This module imports bcrypt (Node.js-only). For client components,
 * import validatePassword from './password-validation' instead.
 */

import bcrypt from 'bcrypt'

// Re-export validation utilities (these are client-safe)
export {
  validatePassword,
  type PasswordValidationError,
  type PasswordValidationResult,
} from './password-validation'

const BCRYPT_COST_FACTOR = 12

/**
 * Hashes a password using bcrypt with cost factor 12.
 * Each call produces a unique hash due to random salt generation.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR)
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 * Returns true if the password matches the hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
