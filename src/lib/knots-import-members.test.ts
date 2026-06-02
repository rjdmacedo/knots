import { memberToAddSchema } from '@/lib/knots-import-members'

describe('memberToAddSchema', () => {
  it('accepts userId without email', () => {
    const parsed = memberToAddSchema.parse({
      exportName: 'Ana',
      userId: 'user-ana',
    })

    expect(parsed).toEqual({
      exportName: 'Ana',
      userId: 'user-ana',
    })
  })

  it('accepts email without userId', () => {
    const parsed = memberToAddSchema.parse({
      exportName: 'Bob',
      email: 'bob@example.com',
      name: 'Bob Smith',
    })

    expect(parsed).toEqual({
      exportName: 'Bob',
      email: 'bob@example.com',
      name: 'Bob Smith',
    })
  })

  it('rejects when both userId and email are provided', () => {
    expect(() =>
      memberToAddSchema.parse({
        exportName: 'Ana',
        userId: 'user-ana',
        email: 'ana@example.com',
      }),
    ).toThrow(/Exactly one of userId or email/)
  })

  it('rejects when neither userId nor email is provided', () => {
    expect(() =>
      memberToAddSchema.parse({
        exportName: 'Ana',
      }),
    ).toThrow(/Exactly one of userId or email/)
  })
})
