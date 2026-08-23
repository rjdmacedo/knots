/**
 * Property-based tests for group-activity-digest.
 * Feature: unified-group-notifications
 */

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendGroupActivityDigestEmail: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    activity: {
      findMany: jest.fn(),
    },
    groupMembership: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    groupEmailDigestPending: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

import { emailService } from '@/lib/auth/email-service'
import {
  processDueGroupEmailDigests,
  scheduleGroupEmailDigest,
} from '@/lib/email/group-activity-digest'
import { prisma } from '@/lib/prisma'
import { isActivityTypeEnabled } from '@/lib/push/subscription-filters'
import { ActivityType } from '@prisma/client'
import fc from 'fast-check'

const mockCount = prisma.groupMembership.count as jest.Mock
const mockUpsert = prisma.groupEmailDigestPending.upsert as jest.Mock
const mockActivityFindMany = prisma.activity.findMany as jest.Mock
const mockMembershipFindMany = prisma.groupMembership.findMany as jest.Mock
const mockPendingFindMany = prisma.groupEmailDigestPending.findMany as jest.Mock
const mockPendingDelete = prisma.groupEmailDigestPending.delete as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockSendEmail = emailService.sendGroupActivityDigestEmail as jest.Mock

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const allActivityTypes: ActivityType[] = [
  ActivityType.CREATE_EXPENSE,
  ActivityType.UPDATE_EXPENSE,
  ActivityType.UPDATE_GROUP,
  ActivityType.DELETE_EXPENSE,
]

/** Generates a non-empty subset of ActivityType values */
const activityTypeSubsetArb = fc.uniqueArray(
  fc.constantFrom(...allActivityTypes),
  { minLength: 0, maxLength: 4 },
)

/** Generates a short unique user ID */
const userIdArb = fc
  .string({ minLength: 3, maxLength: 12 })
  .filter((s) => s.trim().length > 0)

/** Generates 1–5 distinct user IDs (the window actors) */
const windowActorIdsArb = fc.uniqueArray(userIdArb, {
  minLength: 1,
  maxLength: 5,
})

/** Generates a membership-like object whose userId is guaranteed NOT in windowActorIds */
function membershipArb(windowActorIds: string[]) {
  return fc.record({
    userId: userIdArb.filter((id) => !windowActorIds.includes(id)),
    notifyAllMembers: fc.boolean(),
    // includedUserIds may contain real actor IDs (drawn from windowActorIds) or other IDs
    includedUserIds: fc.array(
      fc.oneof(
        fc.constantFrom(
          ...(windowActorIds.length > 0 ? windowActorIds : ['__none__']),
        ),
        userIdArb,
      ),
      { minLength: 0, maxLength: 4 },
    ),
    notifyOnCreate: fc.boolean(),
    notifyOnUpdate: fc.boolean(),
    notifyOnDelete: fc.boolean(),
    // user always has a verified email so the email-delivery gate passes
    user: fc.record({
      id: userIdArb,
      email: fc.emailAddress(),
      emailVerified: fc.constant(new Date('2024-01-01')),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    }),
  })
}

// ─── Helper: compute expected recipients ─────────────────────────────────────

type MembershipRecord = {
  userId: string
  notifyAllMembers: boolean
  includedUserIds: string[]
  notifyOnCreate: boolean
  notifyOnUpdate: boolean
  notifyOnDelete: boolean
  user: {
    id: string
    email: string
    emailVerified: Date
    name: string
  }
}

function computeExpectedRecipients(
  windowEventTypes: ActivityType[],
  windowActorIds: string[],
  memberships: MembershipRecord[],
): MembershipRecord[] {
  if (windowEventTypes.length === 0) return []

  return memberships.filter((m) => {
    // Event-type filter: at least one activity type in the window maps to a true flag
    const wantsEventType = windowEventTypes.some((at) =>
      isActivityTypeEnabled(at, m),
    )
    if (!wantsEventType) return false

    // Member filter: if notifyAllMembers = false, at least one actor must be in includedUserIds
    if (!m.notifyAllMembers) {
      const hasTrackedActor = windowActorIds.some((actorId) =>
        m.includedUserIds.includes(actorId),
      )
      if (!hasTrackedActor) return false
    }

    return true
  })
}

// ─── Property 7 ───────────────────────────────────────────────────────────────

// Property 7: No pending digest row when no qualifying membership exists
// Validates: Requirements 6.1
describe('Property 7: No pending digest row when no qualifying membership', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCount.mockResolvedValue(0)
  })

  it('never calls upsert when groupMembership.count returns 0 for any (groupId, actorUserId)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (groupId, actorUserId) => {
          jest.clearAllMocks()
          mockCount.mockResolvedValue(0)

          await scheduleGroupEmailDigest(groupId, actorUserId)

          expect(mockUpsert).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 9 ───────────────────────────────────────────────────────────────

// Feature: unified-group-notifications, Property 9: Self-notification exclusion from email digest
// Validates: Requirements 6.6
describe('Property 9: Self-notification exclusion from email digest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPendingDelete.mockResolvedValue({})
    mockSendEmail.mockResolvedValue({ ok: true })
  })

  it('passes userId: { notIn: windowActorIds } to the membership query, ensuring actors are excluded at DB level', async () => {
    // Property: for any non-empty set of windowActorIds derived from the activity window,
    // processDueGroupEmailDigests MUST call groupMembership.findMany with
    //   userId: { notIn: <array containing all windowActorIds> }
    // This is the mechanism that enforces Req 6.6 (no self-notifications).
    //
    // We vary: windowActorIds size and values, plus whether windowActorIds is empty
    // (empty case: no notIn filter needed / no actors recorded in window).

    const scenarioArb = fc.oneof(
      // Case A: non-empty actor set — notIn filter must be present
      windowActorIdsArb.map((windowActorIds) => ({
        windowActorIds,
        hasActors: true as const,
      })),
      // Case B: empty actor set — no notIn filter (or empty notIn, both acceptable)
      fc.constant({
        windowActorIds: [] as string[],
        hasActors: false as const,
      }),
    )

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.constantFrom(...allActivityTypes), scenarioArb),
        async ([eventType, { windowActorIds, hasActors }]) => {
          jest.clearAllMocks()
          mockPendingDelete.mockResolvedValue({})
          mockSendEmail.mockResolvedValue({ ok: true })

          const groupId = 'group-p9'
          const lastActorUserId = windowActorIds[0] ?? 'actor-fallback'
          const now = new Date('2024-06-01T12:00:00Z')
          const createdAt = new Date('2024-06-01T11:55:00Z')
          const sendAfter = now

          mockPendingFindMany.mockResolvedValue([
            {
              groupId,
              lastActorUserId,
              sendAfter,
              createdAt,
              group: { id: groupId, name: 'Test Group P9' },
            },
          ])

          // Build activity rows — one per actor so windowActorIds is fully represented
          const activityRows = hasActors
            ? windowActorIds.map((actorId) => ({
                activityType: eventType,
                participantId: actorId,
              }))
            : []
          mockActivityFindMany.mockResolvedValue(activityRows)

          // Return empty memberships — we only care about the findMany call args
          mockMembershipFindMany.mockResolvedValue([])
          mockUserFindUnique.mockResolvedValue({
            id: lastActorUserId,
            name: 'Actor',
          })

          await processDueGroupEmailDigests(now)

          // The findMany must have been called
          expect(mockMembershipFindMany).toHaveBeenCalledTimes(1)
          const callArgs = mockMembershipFindMany.mock.calls[0][0] as {
            where?: { userId?: { notIn?: string[] } }
          }

          if (hasActors) {
            // All actor IDs must appear in the notIn array
            const notInIds: string[] = callArgs?.where?.userId?.notIn ?? []
            for (const actorId of windowActorIds) {
              expect(notInIds).toContain(actorId)
            }
          } else {
            // When there are no actors, the notIn filter should be absent
            expect(callArgs?.where?.userId?.notIn).toBeUndefined()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 10 ──────────────────────────────────────────────────────────────

// Feature: unified-group-notifications, Property 10: Email-disabled members are never digest recipients
// Validates: Requirements 7.4
describe('Property 10: Email-disabled members are never digest recipients', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPendingDelete.mockResolvedValue({})
    mockSendEmail.mockResolvedValue({ ok: true })
  })

  it('never sends email to members with emailNotificationsEnabled=false (DB-level filter enforced)', async () => {
    // Generate a window with some event types and actors, plus memberships whose
    // emailNotificationsEnabled is false. The DB query uses `emailNotificationsEnabled: true`
    // so those members are filtered out before the app ever sees them. We simulate this by
    // mocking groupMembership.findMany to return an empty list (as the DB would), and assert
    // that sendGroupActivityDigestEmail is never called.
    //
    // We also verify the query itself was called with emailNotificationsEnabled: true to ensure
    // the filter contract is maintained.

    const scenarioArb = activityTypeSubsetArb.chain((windowEventTypes) =>
      windowActorIdsArb.chain((windowActorIds) =>
        fc.integer({ min: 1, max: 5 }).chain((count) =>
          fc
            .uniqueArray(membershipArb(windowActorIds), {
              minLength: count,
              maxLength: count,
              selector: (m) => m.userId,
            })
            // tag each membership as email-disabled (as if the user has opted out)
            .map((members) => ({
              windowEventTypes,
              windowActorIds,
              // These members have emailNotificationsEnabled=false; the DB query should exclude them
              disabledMembers: members.map((m) => ({
                ...m,
                emailNotificationsEnabled: false,
              })),
            })),
        ),
      ),
    )

    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ({ windowEventTypes, windowActorIds, disabledMembers }) => {
          jest.clearAllMocks()
          mockPendingDelete.mockResolvedValue({})
          mockSendEmail.mockResolvedValue({ ok: true })

          const groupId = 'group-p10'
          const lastActorUserId = windowActorIds[0] ?? 'actor-fallback'
          const now = new Date('2024-06-01T12:00:00Z')
          const createdAt = new Date('2024-06-01T11:55:00Z')
          const sendAfter = now

          // One pending digest row
          mockPendingFindMany.mockResolvedValue([
            {
              groupId,
              lastActorUserId,
              sendAfter,
              createdAt,
              group: { id: groupId, name: 'Test Group P10' },
            },
          ])

          // Activity window has events and actors
          const activityRows: Array<{
            activityType: ActivityType
            participantId: string | null
          }> = []
          if (windowEventTypes.length > 0 && windowActorIds.length > 0) {
            windowEventTypes.forEach((activityType, idx) => {
              activityRows.push({
                activityType,
                participantId: windowActorIds[idx % windowActorIds.length],
              })
            })
            windowActorIds.forEach((actorId) => {
              if (!activityRows.some((r) => r.participantId === actorId)) {
                activityRows.push({
                  activityType: windowEventTypes[0],
                  participantId: actorId,
                })
              }
            })
          }
          mockActivityFindMany.mockResolvedValue(activityRows)

          // Simulate the DB correctly filtering out email-disabled members:
          // groupMembership.findMany returns empty because all members have emailNotificationsEnabled=false
          mockMembershipFindMany.mockResolvedValue([])

          mockUserFindUnique.mockResolvedValue({
            id: lastActorUserId,
            name: 'Actor P10',
          })

          await processDueGroupEmailDigests(now)

          // No emails should ever be sent to email-disabled members
          expect(mockSendEmail).not.toHaveBeenCalled()

          // Verify the DB query was made with emailNotificationsEnabled: true
          // (this is the contract that keeps disabled members out)
          expect(mockMembershipFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                emailNotificationsEnabled: true,
              }),
            }),
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ─── Property 8 ───────────────────────────────────────────────────────────────

// Feature: unified-group-notifications, Property 8: Email digest recipient eligibility (event-type AND member filters)
// Validates: Requirements 6.3, 6.4, 6.5
describe('Property 8: Email digest recipient eligibility (event-type AND member filters)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPendingDelete.mockResolvedValue({})
    mockSendEmail.mockResolvedValue({ ok: true })
  })

  it('sends emails to exactly the members satisfying both event-type and member filters', async () => {
    // Compose the entire scenario in one chained arbitrary so all IDs are consistent
    const scenarioArb = activityTypeSubsetArb.chain((windowEventTypes) =>
      windowActorIdsArb.chain((windowActorIds) =>
        fc.integer({ min: 0, max: 5 }).chain((count) =>
          fc
            .uniqueArray(membershipArb(windowActorIds), {
              minLength: count,
              maxLength: count,
              selector: (m) => m.userId,
            })
            .map((members) => ({ windowEventTypes, windowActorIds, members })),
        ),
      ),
    )

    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        async ({ windowEventTypes, windowActorIds, members }) => {
          jest.clearAllMocks()
          mockPendingDelete.mockResolvedValue({})
          mockSendEmail.mockResolvedValue({ ok: true })

          const groupId = 'group-p8'
          const lastActorUserId = windowActorIds[0] ?? 'actor-fallback'
          const now = new Date('2024-06-01T12:00:00Z')
          const createdAt = new Date('2024-06-01T11:55:00Z')
          const sendAfter = now

          // Mock: one pending digest row
          mockPendingFindMany.mockResolvedValue([
            {
              groupId,
              lastActorUserId,
              sendAfter,
              createdAt,
              group: { id: groupId, name: 'Test Group' },
            },
          ])

          // Mock: activity window — generate one activity per (eventType, actorId) combination
          // so both windowEventTypes and windowActorIds are fully represented in the mock data
          // The implementation derives its sets from these rows, so they must match exactly.
          const activityRows: Array<{
            activityType: ActivityType
            participantId: string | null
          }> = []
          if (windowEventTypes.length > 0 && windowActorIds.length > 0) {
            // At minimum ensure every eventType appears at least once and every actor appears at least once
            windowEventTypes.forEach((activityType, idx) => {
              activityRows.push({
                activityType,
                participantId: windowActorIds[idx % windowActorIds.length],
              })
            })
            // Add one row per additional actor to ensure all actorIds are present in participantIds
            windowActorIds.forEach((actorId, idx) => {
              if (!activityRows.some((r) => r.participantId === actorId)) {
                activityRows.push({
                  activityType: windowEventTypes[idx % windowEventTypes.length],
                  participantId: actorId,
                })
              }
            })
          }
          mockActivityFindMany.mockResolvedValue(activityRows)

          // Mock: memberships (pre-filtered: no actor IDs present in userId)
          mockMembershipFindMany.mockResolvedValue(members)

          // Mock: actor user
          mockUserFindUnique.mockResolvedValue({
            id: lastActorUserId,
            name: 'Actor',
          })

          await processDueGroupEmailDigests(now)

          // Compute expected recipients using the same logic as the implementation
          const expectedRecipients = computeExpectedRecipients(
            windowEventTypes,
            windowActorIds,
            members,
          )

          expect(mockSendEmail).toHaveBeenCalledTimes(expectedRecipients.length)

          // When emails were sent, verify each expected recipient's email was used
          if (expectedRecipients.length > 0) {
            const calledEmails: string[] = mockSendEmail.mock.calls.map(
              (call: unknown[]) => call[0] as string,
            )
            const expectedEmails = expectedRecipients.map((m) => m.user.email)
            expect(calledEmails.sort()).toEqual(expectedEmails.sort())
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
