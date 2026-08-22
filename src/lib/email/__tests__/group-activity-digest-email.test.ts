import {
  buildGroupActivityDigestEmailHtml,
  buildGroupActivityDigestEmailSubject,
  buildGroupActivityDigestEmailText,
} from '@/lib/auth/email-service'

describe('group activity digest email template', () => {
  it('mentions the actor and group and links to activity', () => {
    const html = buildGroupActivityDigestEmailHtml(
      'Alice',
      'Trip',
      'http://localhost:3000/groups/gid/activity',
    )
    const text = buildGroupActivityDigestEmailText(
      'Alice',
      'Trip',
      'http://localhost:3000/groups/gid/activity',
    )
    const subject = buildGroupActivityDigestEmailSubject('Alice', 'Trip')

    expect(subject).toContain('Alice')
    expect(subject).toContain('Trip')
    expect(html).toContain('Alice')
    expect(html).toContain('Trip')
    expect(html).toContain('http://localhost:3000/groups/gid/activity')
    expect(html).toContain('View activity')
    expect(text).toContain('Alice made changes in the group "Trip".')
    expect(text).toContain('http://localhost:3000/groups/gid/activity')
  })
})
