/**
 * Normalizes a date to noon UTC, preserving the local calendar day.
 *
 * This prevents timezone-related date shifts when serializing dates.
 * By setting the time to noon UTC, the calendar day remains the same
 * regardless of the user's timezone offset (max ±12 hours from noon
 * still lands on the same calendar day).
 */
export function toNoonUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
  )
}
