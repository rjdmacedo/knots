/**
 * Pure, dependency-free helpers for email-address normalization and
 * validation used by the email-change challenge flow.
 *
 * These functions never touch the database or the network so they can be
 * unit- and property-tested in isolation (see task 2.2).
 */

import { z } from 'zod'

const emailSchema = z.string().email()

/**
 * Normalizes an email address for storage and comparison:
 * trims surrounding whitespace and lower-cases it.
 *
 * This mirrors how the auth service normalizes emails elsewhere so a
 * change confirmed here compares equal to the credentials lookup.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Returns true when the (already trimmed/lower-cased) value is a
 * syntactically valid email address.
 */
export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success
}

export type EmailAddressError = 'INVALID_EMAIL' | 'SAME_EMAIL'

export type EmailAddressResult =
  | { ok: true; email: string }
  | { ok: false; error: EmailAddressError }

/**
 * Normalizes and validates a candidate new email against the current one.
 *
 * Pure function — the caller is responsible for the "already in use by
 * another user" check, which requires a database lookup.
 *
 * - Rejects empty or syntactically invalid addresses with INVALID_EMAIL.
 * - Rejects an address equal to the current one (after normalization) with
 *   SAME_EMAIL.
 * - Otherwise returns the normalized address.
 */
export function prepareNewEmail(
  candidate: string,
  currentEmail: string,
): EmailAddressResult {
  const normalized = normalizeEmail(candidate)

  if (normalized.length === 0 || !isValidEmail(normalized)) {
    return { ok: false, error: 'INVALID_EMAIL' }
  }

  if (normalized === normalizeEmail(currentEmail)) {
    return { ok: false, error: 'SAME_EMAIL' }
  }

  return { ok: true, email: normalized }
}
