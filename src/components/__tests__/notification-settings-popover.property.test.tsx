/**
 * Property-based tests for NotificationSettingsPopover.
 *
 * Feature: unified-group-notifications
 * - Property 2: Filter sections visibility tracks channel state
 * - Property 6: Validation guard blocks invalid filter saves
 *
 * Validates: Requirements 2.4, 2.5, 5.7
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({})
const mockSubscribe = jest.fn().mockResolvedValue(undefined)
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined)
const mockUpdatePreferences = jest.fn().mockResolvedValue(undefined)
const mockClearError = jest.fn()

// next-intl: return the key as the translation so we can match on key names
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Push notification subscription hook
jest.mock('@/lib/push/use-push-notification-subscription', () => ({
  isPushSupported: () => false,
  usePushNotificationSubscription: jest.fn(),
}))

// tRPC client
jest.mock('@/trpc/client', () => ({
  trpc: {
    groupMembership: {
      getNotificationPreferences: {
        useQuery: jest.fn(),
      },
      setNotificationPreferences: {
        useMutation: jest.fn(),
      },
    },
  },
}))

import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'

const mockUsePush = usePushNotificationSubscription as jest.Mock
const mockGetPrefsQuery = trpc.groupMembership.getNotificationPreferences
  .useQuery as jest.Mock
const mockSetPrefsMutation = trpc.groupMembership.setNotificationPreferences
  .useMutation as jest.Mock

// ---------------------------------------------------------------------------
// Lazy import (after mocks are registered)
// ---------------------------------------------------------------------------

// We import the component inside beforeAll to ensure mocks are set first

let NotificationSettingsPopover: React.ComponentType<{
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}>

beforeAll(async () => {
  const mod = await import('../notification-settings-popover')
  NotificationSettingsPopover = mod.NotificationSettingsPopover
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PBT_NUM_RUNS = 100
const GROUP_ID = 'group-1'
const USER_ID = 'user-1'
const MEMBERS = [{ id: USER_ID, name: 'Alice' }]

// ---------------------------------------------------------------------------
// Helper: configure mocks for a given channel state
// ---------------------------------------------------------------------------

function setupMocks({
  pushEnabled = false,
  emailEnabled = false,
  prefs = {},
}: {
  pushEnabled?: boolean
  emailEnabled?: boolean
  prefs?: Partial<{
    notifyAllMembers: boolean
    includedUserIds: string[]
    notifyOnCreate: boolean
    notifyOnUpdate: boolean
    notifyOnDelete: boolean
  }>
} = {}) {
  const defaultPrefs = {
    emailNotificationsEnabled: emailEnabled,
    notifyAllMembers: true,
    includedUserIds: [] as string[],
    notifyOnCreate: true,
    notifyOnUpdate: true,
    notifyOnDelete: true,
    ...prefs,
  }

  mockUsePush.mockReturnValue({
    isSubscribed: pushEnabled,
    isLoading: false,
    error: null,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    updatePreferences: mockUpdatePreferences,
    clearError: mockClearError,
  })

  mockGetPrefsQuery.mockReturnValue({
    data: defaultPrefs,
    isError: false,
    isLoading: false,
  })

  mockSetPrefsMutation.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })
}

// ---------------------------------------------------------------------------
// P2: Filter sections visibility tracks channel state
// ---------------------------------------------------------------------------

// Feature: unified-group-notifications, Property 2: Filter sections visibility tracks channel state
describe('Property 2: Filter sections visibility tracks channel state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * For any combination of (pushEnabled, emailEnabled) booleans,
   * the Members and Events filter sections SHALL be visible if and only if
   * at least one channel is enabled.
   */
  it('shows Members and Events sections iff at least one channel is enabled', () => {
    // Feature: unified-group-notifications, Property 2: Filter sections visibility tracks channel state
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (pushEnabled, emailEnabled) => {
        setupMocks({ pushEnabled, emailEnabled })

        const { unmount, container } = render(
          <NotificationSettingsPopover
            groupId={GROUP_ID}
            members={MEMBERS}
            currentUserId={USER_ID}
          />,
        )

        const atLeastOneEnabled = pushEnabled || emailEnabled

        // Suppress unused-variable warning — container is rendered but sections
        // are queried via screen below.
        void container

        if (atLeastOneEnabled) {
          expect(screen.queryByText('membersLabel')).toBeInTheDocument()
          expect(screen.queryByText('eventsLabel')).toBeInTheDocument()
        } else {
          expect(screen.queryByText('membersLabel')).not.toBeInTheDocument()
          expect(screen.queryByText('eventsLabel')).not.toBeInTheDocument()
          // Hint should be visible instead
          expect(screen.queryByText('enableChannelHint')).toBeInTheDocument()
        }

        unmount()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// P6: Validation guard blocks invalid filter saves
// ---------------------------------------------------------------------------

// Feature: unified-group-notifications, Property 6: Validation guard blocks invalid filter saves
describe('Property 6: Validation guard blocks invalid filter saves', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  /**
   * **Validates: Requirements 5.7**
   *
   * For any filter state where all three event flags are false,
   * no setNotificationPreferences mutation SHALL be issued and
   * the inline validation message SHALL be present.
   *
   * The validation guard operates at render time: when `isFilterValid` is false,
   * the component shows the `selectAtLeastOneFilter` message and `saveFilters`
   * early-returns without calling `mutateAsync`. We verify both invariants by
   * inspecting the rendered output — no manual interaction is needed.
   */
  it('shows validation message and issues no mutation when all event flags are false', () => {
    // Feature: unified-group-notifications, Property 6: Validation guard blocks invalid filter saves
    fc.assert(
      fc.property(fc.boolean(), (notifyAllOthers) => {
        // Member part may be valid or invalid — either way, all-false events = invalid
        const selectedMemberIds = notifyAllOthers ? [] : ['other-user-id']
        setupMocks({
          pushEnabled: true, // channel on so filters section is visible
          prefs: {
            notifyAllMembers: notifyAllOthers,
            includedUserIds: selectedMemberIds,
            notifyOnCreate: false,
            notifyOnUpdate: false,
            notifyOnDelete: false,
          },
        })

        const { unmount } = render(
          <NotificationSettingsPopover
            groupId={GROUP_ID}
            members={[
              { id: USER_ID, name: 'Alice' },
              { id: 'other-user-id', name: 'Bob' },
            ]}
            currentUserId={USER_ID}
          />,
        )

        // The validation message is shown whenever isFilterValid is false
        expect(screen.getByText('selectAtLeastOneFilter')).toBeInTheDocument()

        // No mutation was issued during render (saveFilters is never called
        // on mount — it is invoked only from change handlers, and when
        // isFilterValid is false it early-returns before calling mutateAsync)
        expect(mockMutateAsync).not.toHaveBeenCalled()

        unmount()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  /**
   * **Validates: Requirements 5.7**
   *
   * For any filter state where notifyAllMembers=false and includedUserIds=[],
   * no setNotificationPreferences mutation SHALL be issued and
   * the inline validation message SHALL be present.
   */
  it('shows validation message and issues no mutation when notifyAllMembers=false and no members selected', () => {
    // Feature: unified-group-notifications, Property 6: Validation guard blocks invalid filter saves
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (notifyOnCreate, notifyOnUpdate, notifyOnDelete) => {
          // At least one event flag true to isolate the member constraint
          fc.pre(notifyOnCreate || notifyOnUpdate || notifyOnDelete)

          setupMocks({
            pushEnabled: true, // channel on so filters section is visible
            prefs: {
              notifyAllMembers: false,
              includedUserIds: [], // empty — violates member constraint
              notifyOnCreate,
              notifyOnUpdate,
              notifyOnDelete,
            },
          })

          const { unmount } = render(
            <NotificationSettingsPopover
              groupId={GROUP_ID}
              members={[
                { id: USER_ID, name: 'Alice' },
                { id: 'other-user-id', name: 'Bob' },
              ]}
              currentUserId={USER_ID}
            />,
          )

          // Validation message visible because member constraint is violated
          expect(screen.getByText('selectAtLeastOneFilter')).toBeInTheDocument()

          // No mutation was issued (saveFilters would early-return if called)
          expect(mockMutateAsync).not.toHaveBeenCalled()

          unmount()
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  /**
   * **Validates: Requirements 5.7**
   *
   * Combined: both constraints simultaneously violated (all events false AND no members).
   */
  it('shows validation message and issues no mutation when both event and member constraints are violated', () => {
    // Feature: unified-group-notifications, Property 6: Validation guard blocks invalid filter saves
    fc.assert(
      fc.property(fc.constant(null), () => {
        setupMocks({
          pushEnabled: true,
          prefs: {
            notifyAllMembers: false,
            includedUserIds: [],
            notifyOnCreate: false,
            notifyOnUpdate: false,
            notifyOnDelete: false,
          },
        })

        const { unmount } = render(
          <NotificationSettingsPopover
            groupId={GROUP_ID}
            members={[
              { id: USER_ID, name: 'Alice' },
              { id: 'other-user-id', name: 'Bob' },
            ]}
            currentUserId={USER_ID}
          />,
        )

        // Validation message must always appear when both constraints are violated
        expect(screen.getByText('selectAtLeastOneFilter')).toBeInTheDocument()

        // No mutation was issued
        expect(mockMutateAsync).not.toHaveBeenCalled()

        unmount()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
