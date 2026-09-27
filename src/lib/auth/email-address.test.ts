import {
  isValidEmail,
  normalizeEmail,
  prepareNewEmail,
} from '@/lib/auth/email-address'

describe('normalizeEmail', () => {
  it('trims surrounding whitespace and lower-cases', () => {
    expect(normalizeEmail('  Foo@Example.COM  ')).toBe('foo@example.com')
  })

  it('is idempotent', () => {
    const once = normalizeEmail('  Foo@Example.COM  ')
    expect(normalizeEmail(once)).toBe(once)
  })
})

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects empty and malformed addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@tld')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('spaces in@example.com')).toBe(false)
  })
})

describe('prepareNewEmail', () => {
  const current = 'current@example.com'

  it('normalizes and returns a valid new address', () => {
    expect(prepareNewEmail('  New@Example.com ', current)).toEqual({
      ok: true,
      email: 'new@example.com',
    })
  })

  it('rejects an empty address as INVALID_EMAIL', () => {
    expect(prepareNewEmail('   ', current)).toEqual({
      ok: false,
      error: 'INVALID_EMAIL',
    })
  })

  it('rejects a malformed address as INVALID_EMAIL', () => {
    expect(prepareNewEmail('nope', current)).toEqual({
      ok: false,
      error: 'INVALID_EMAIL',
    })
  })

  it('rejects the current address (case/space-insensitive) as SAME_EMAIL', () => {
    expect(prepareNewEmail('  CURRENT@example.COM ', current)).toEqual({
      ok: false,
      error: 'SAME_EMAIL',
    })
  })
})
