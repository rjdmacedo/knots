/**
 * Property-based tests for VAPID key validation.
 *
 * Feature: group-push-notifications
 * - Property 2: VAPID key validation accepts only valid base64url strings
 *
 * Validates: Requirements 2.1
 */

import fc from 'fast-check'

// --- Constants ---

const PBT_NUM_RUNS = 100

/**
 * The regex used in src/lib/env.ts for VAPID key validation.
 * VAPID keys must be non-empty base64url-encoded strings.
 */
const VAPID_KEY_REGEX = /^[A-Za-z0-9_-]+$/

// --- Helpers ---

/**
 * Validates a VAPID key string using the same regex as the Zod schema in env.ts.
 * Returns true if the string is a valid base64url-encoded key (non-empty).
 */
function isValidVapidKey(value: string): boolean {
  return VAPID_KEY_REGEX.test(value)
}

// --- Generators ---

/** Generates valid base64url characters */
const base64urlChar = fc.constantFrom(
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split(
    '',
  ),
)

/** Generates non-empty strings composed exclusively of valid base64url characters */
const arbValidVapidKey = fc
  .array(base64urlChar, { minLength: 1, maxLength: 100 })
  .map((chars) => chars.join(''))

/** Generates strings that contain at least one character outside the base64url alphabet */
const arbInvalidVapidKey = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 50 }),
    fc
      .integer({ min: 0, max: 127 })
      .filter((code) => {
        const c = String.fromCharCode(code)
        return !VAPID_KEY_REGEX.test(c)
      })
      .map((code) => String.fromCharCode(code)),
    fc.string({ minLength: 0, maxLength: 50 }),
  )
  .map(([prefix, invalidChar, suffix]) => prefix + invalidChar + suffix)

// --- Tests ---

describe('VAPID Key Validation — Property Tests', () => {
  // Feature: group-push-notifications, Property 2: VAPID key validation accepts only valid base64url strings

  describe('Property 2: VAPID key validation accepts only valid base64url strings', () => {
    /**
     * Validates: Requirements 2.1
     *
     * For any non-empty string composed exclusively of base64url characters
     * ([A-Za-z0-9_-]), the validation regex SHALL accept it.
     */
    it('accepts any non-empty string composed exclusively of base64url characters', () => {
      fc.assert(
        fc.property(arbValidVapidKey, (key) => {
          expect(isValidVapidKey(key)).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Validates: Requirements 2.1
     *
     * For any string containing at least one character outside the base64url
     * alphabet, the validation regex SHALL reject it.
     */
    it('rejects any string containing characters outside the base64url alphabet', () => {
      fc.assert(
        fc.property(arbInvalidVapidKey, (key) => {
          expect(isValidVapidKey(key)).toBe(false)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Validates: Requirements 2.1
     *
     * The empty string SHALL be rejected since VAPID keys must be non-empty.
     */
    it('rejects the empty string', () => {
      expect(isValidVapidKey('')).toBe(false)
    })
  })
})
