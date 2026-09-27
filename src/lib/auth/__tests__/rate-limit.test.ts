import {
  FixedWindowLimiter,
  authEmailRecipientLimiter,
  hashRateLimitIdentity,
} from '@/lib/auth/rate-limiter'

describe('FixedWindowLimiter', () => {
  it('allows requests up to the limit then rejects with retry-after', () => {
    const limiter = new FixedWindowLimiter({ limit: 3, windowMs: 60_000 })
    const now = 1_000_000

    expect(limiter.hit('key', now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    expect(limiter.hit('key', now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    expect(limiter.hit('key', now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })

    const blocked = limiter.hit('key', now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(60)
  })

  it('tracks keys independently', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 })
    const now = 1_000_000

    expect(limiter.hit('a', now).allowed).toBe(true)
    expect(limiter.hit('b', now).allowed).toBe(true)
    expect(limiter.hit('a', now).allowed).toBe(false)
    expect(limiter.hit('b', now).allowed).toBe(false)
  })

  it('supports weighted consumption', () => {
    const limiter = new FixedWindowLimiter({ limit: 5, windowMs: 60_000 })
    const now = 1_000_000

    expect(limiter.hit('sender', now, 4).allowed).toBe(true)
    expect(limiter.hit('sender', now).allowed).toBe(true)
    expect(limiter.hit('sender', now).allowed).toBe(false)
  })

  it('rejects invalid consumption costs', () => {
    const limiter = new FixedWindowLimiter({ limit: 5, windowMs: 60_000 })

    expect(() => limiter.hit('sender', Date.now(), 0)).toThrow(RangeError)
    expect(() => limiter.hit('sender', Date.now(), -1)).toThrow(RangeError)
  })

  it('resets the window once it expires', () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 })
    const now = 1_000_000

    expect(limiter.hit('ip', now).allowed).toBe(true)
    expect(limiter.hit('ip', now + 1000).allowed).toBe(false)
    expect(limiter.hit('ip', now + 60_001).allowed).toBe(true)
  })

  it('bounds memory by evicting expired then soonest-resetting buckets', () => {
    const limiter = new FixedWindowLimiter({
      limit: 5,
      windowMs: 60_000,
      maxKeys: 3,
    })
    const now = 1_000_000

    limiter.hit('a', now)
    limiter.hit('b', now + 10)
    limiter.hit('c', now + 20)
    expect(limiter.size).toBe(3)

    // A fourth distinct key forces eviction down to maxKeys
    limiter.hit('d', now + 30)
    expect(limiter.size).toBeLessThanOrEqual(3)
    // The newest key is retained
    expect(limiter.hit('d', now + 31).allowed).toBe(true)
  })

  it('clears all entries when requested', () => {
    const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 60_000 })
    limiter.hit('test')
    expect(limiter.size).toBe(1)
    limiter.clear()
    expect(limiter.size).toBe(0)
  })
})

describe('hashRateLimitIdentity', () => {
  it('consistently hashes an identity string', () => {
    const hash1 = hashRateLimitIdentity('user@example.com')
    const hash2 = hashRateLimitIdentity('user@example.com')
    const hash3 = hashRateLimitIdentity('other@example.com')

    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
    expect(hash1).toHaveLength(16)
  })
})

describe('authEmailRecipientLimiter', () => {
  it('is configured for 10 attempts per 1 hour', () => {
    authEmailRecipientLimiter.clear()
    const now = 10_000_000
    const key = 'test-recipient'

    for (let i = 0; i < 10; i++) {
      expect(authEmailRecipientLimiter.hit(key, now).allowed).toBe(true)
    }

    const blocked = authEmailRecipientLimiter.hit(key, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(3600)
  })
})
