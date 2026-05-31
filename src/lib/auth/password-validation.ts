/**
 * Password validation utilities — client-safe (no Node.js dependencies).
 * This module can be imported in both client and server components.
 */

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

export type PasswordValidationError =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'MISSING_UPPERCASE'
  | 'MISSING_LOWERCASE'
  | 'MISSING_DIGIT'

export interface PasswordValidationResult {
  valid: boolean
  errors: PasswordValidationError[]
}

/**
 * Validates a password against the following rules:
 * - Length between 8 and 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: PasswordValidationError[] = []

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push('TOO_SHORT')
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push('TOO_LONG')
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('MISSING_UPPERCASE')
  }

  if (!/[a-z]/.test(password)) {
    errors.push('MISSING_LOWERCASE')
  }

  if (!/\d/.test(password)) {
    errors.push('MISSING_DIGIT')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
