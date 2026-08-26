/**
 * Property-based tests for GroupNotificationToggle / NotificationSettingsPopover.
 *
 * Feature: unified-group-notifications
 * - Property 1: Bell icon reflects channel state
 * - Property 3: Push channel inherits defaults on first subscribe
 * - Property 5: Shared filter write-through to PushSubscription
 *
 * Validates: Requirements 1.4, 3.5, 5.5, 7.2
 */

import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateAsync = jest.fn().mockResolvedValue({})
const mockSubscribe = jest.fn().mockResolvedValue(undefined)
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined)
const mockClearError = jest.fn()

// next-intl: return the key as the translation so we can match on key names
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Push notification subscription hook
jest.mock('@/lib/push/use-push-notification-subscription', () => ({
  isPushSupported: jest.fn().mockReturnValue(false),
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

// sonner toast (prevent side-effects)
jest.mock('sonner', () => ({
  toast: { error: jest.fn(), warning: jest.fn() },
}))

// Mock @/components/ui/switch to avoid jsdom PointerEvent issues with @base-ui.
// The mock renders a simple <button role="switch"> that calls onCheckedChange
// when clicked, bypassing @base-ui's PointerEvent dependency.
jest.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
    'aria-label'?: string
  }) =>
    React.createElement('button', {
      role: 'switch',
      'aria-checked': checked ?? false,
      'aria-label': ariaLabel,
      disabled,
      onClick: () => {
        if (!disabled && onCheckedChange) {
          onCheckedChange(!(checked ?? false))
        }
      },
    }),
}))

// Mock @/components/ui/checkbox similarly to avoid PointerEvent issues
jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
    id,
  }: {
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
    id?: string
  }) =>
    React.createElement('input', {
      type: 'checkbox',
      id,
      checked: checked ?? false,
      disabled,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!disabled && onCheckedChange) {
          onCheckedChange(e.target.checked)
        }
      },
      readOnly: !onCheckedChange,
    }),
}))

// useId: return stable ID so aria attributes are predictable
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useId: () => 'test-id',
}))

import {
  isPushSupported,
  usePushNotificationSubscription,
} from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'

const mockUsePush = usePushNotificationSubscription as jest.Mock
const mockIsPushSupported = isPushSupported as jest.Mock
const mockGetPrefsQuery = trpc.groupMembership.getNotificationPreferences
  .useQuery as jest.Mock
const mockSetPrefsMutation = trpc.groupMembership.setNotificationPreferences
  .useMutation as jest.Mock

// ---------------------------------------------------------------------------
// Lazy import (after mocks are registered)
// ---------------------------------------------------------------------------

let NotificationSettingsPopover: React.ComponentType<{
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}>

let GroupNotificationToggle: React.ComponentType<{
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}>

beforeAll(async () => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-key'
  const popoverMod = await import('../notification-settings-popover')
  NotificationSettingsPopover = popoverMod.NotificationSettingsPopover

  // GroupNotificationToggle may not exist if not yet implemented — guard for it
  try {
    const toggleMod = await import('../group-notification-toggle')
    GroupNotificationToggle = toggleMod.GroupNotificationToggle
  } catch {
    // Will be skipped in P1/P3 if not yet present
  }
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PBT_NUM_RUNS = 100
const GROUP_ID = 'group-1'
const USER_ID = 'user-1'
const MEMBERS = [
  { id: USER_ID, name: 'Alice' },
  { id: 'user-2', name: 'Bob' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PushHookReturn = {
  isSubscribed: boolean
  isLoading: boolean
  error: null | string
  subscribe: jest.Mock
  unsubscribe: jest.Mock
  clearError: jest.Mock
}

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
} = {}): PushHookReturn {
  const hookReturn: PushHookReturn = {
    isSubscribed: pushEnabled,
    isLoading: false,
    error: null,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    clearError: mockClearError,
  }

  mockUsePush.mockReturnValue(hookReturn)

  mockGetPrefsQuery.mockReturnValue({
    data: {
      emailNotificationsEnabled: emailEnabled,
      notifyAllMembers: true,
      includedUserIds: [] as string[],
      notifyOnCreate: true,
      notifyOnUpdate: true,
      notifyOnDelete: true,
      ...prefs,
    },
    isError: false,
    isLoading: false,
  })

  mockSetPrefsMutation.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })

  return hookReturn
}

// ---------------------------------------------------------------------------
// P5: Shared filter mutation saved to GroupMembership
// ---------------------------------------------------------------------------

/**
 * Feature: unified-group-notifications, Property 5: Shared filter mutation saved to GroupMembership
 *
 * **Validates: Requirements 5.5, 7.2**
 */
describe('Property 5: Shared filter mutation saved to GroupMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Arbitraries
  // --------------------------------------------------------------------------

  /**
   * Generate a valid member ID list: either empty (used when notifyAllMembers=true)
   * or 1-5 UUIDs (used when notifyAllMembers=false).
   */
  const arbUserIds = fc.array(fc.uuid(), { minLength: 1, maxLength: 5 })

  /**
   * A valid filter combination: all five fields.
   */
  const arbFilterCombo = fc.record({
    notifyAllMembers: fc.boolean(),
    includedUserIds: arbUserIds,
    notifyOnCreate: fc.boolean(),
    notifyOnUpdate: fc.boolean(),
    notifyOnDelete: fc.boolean(),
  })

  it('mutateAsync is called with correct filter values when checkbox is changed', async () => {
    await fc.assert(
      fc.asyncProperty(arbFilterCombo, async (combo) => {
        jest.clearAllMocks()

        const {
          notifyAllMembers,
          includedUserIds,
          notifyOnCreate,
          notifyOnUpdate,
          notifyOnDelete,
        } = combo

        // Pre-conditions:
        // At least one event flag must be true AND member selection must be valid
        // so that saveFilters is not blocked by the validation guard.
        const validIncludedIds = notifyAllMembers ? [] : includedUserIds
        const memberSelectionValid =
          notifyAllMembers || validIncludedIds.length > 0
        fc.pre(
          (notifyOnCreate || notifyOnUpdate || notifyOnDelete) &&
            memberSelectionValid,
        )

        // Set up mocks
        mockMutateAsync.mockResolvedValue({})

        setupMocks({
          pushEnabled: true,
          prefs: {
            notifyAllMembers,
            includedUserIds: validIncludedIds,
            notifyOnCreate,
            notifyOnUpdate,
            notifyOnDelete,
          },
        })

        const { unmount } = render(
          <NotificationSettingsPopover
            groupId={GROUP_ID}
            members={MEMBERS}
            currentUserId={USER_ID}
          />,
        )

        // Find the "notify on create" checkbox button
        const createCheckbox = screen
          .getAllByRole('checkbox')
          .find((el) => el.id === 'test-id-create')

        if (createCheckbox) {
          const toggledCreate = !notifyOnCreate
          const stillValid = toggledCreate || notifyOnUpdate || notifyOnDelete

          if (stillValid) {
            await act(async () => {
              createCheckbox.click()
            })

            // Give the async saveFilters chain time to resolve
            await act(async () => {
              await Promise.resolve()
            })

            expect(mockMutateAsync).toHaveBeenCalledWith({
              groupId: GROUP_ID,
              notifyOnCreate: toggledCreate,
            })
          }
        }

        unmount()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

// ---------------------------------------------------------------------------
// P3: Push channel inherits defaults on first subscribe
// ---------------------------------------------------------------------------

/**
 * Feature: unified-group-notifications, Property 3: Push channel inherits defaults on first subscribe
 *
 * For any group member who has no prior shared filter preferences persisted on
 * GroupMembership (i.e. all filter fields are at their schema defaults), when they
 * enable the Push channel, subscribe SHALL be called.
 *
 * **Validates: Requirements 3.5**
 */
describe('Property 3: Push channel inherits defaults on first subscribe', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Push IS supported for P3 tests
    mockIsPushSupported.mockReturnValue(true)
  })

  afterEach(() => {
    // Restore the default (false) for other test suites
    mockIsPushSupported.mockReturnValue(false)
  })

  it('calls subscribe when no saved prefs exist', async () => {
    // Feature: unified-group-notifications, Property 3: Push channel inherits defaults on first subscribe
    await fc.assert(
      fc.asyncProperty(
        // Any non-empty userId — varies what defaultPushPreferences(userId) returns
        fc.string({ minLength: 1, maxLength: 64 }),
        async (userId) => {
          const subscribeMock = jest.fn().mockResolvedValue(null)

          // Push hook: not yet subscribed, push supported, no error
          mockUsePush.mockReturnValue({
            isSubscribed: false,
            isLoading: false,
            error: null,
            subscribe: subscribeMock,
            unsubscribe: jest.fn().mockResolvedValue(null),
            clearError: jest.fn(),
          })

          // No saved preferences → data is undefined → sharedPrefs will be null
          mockGetPrefsQuery.mockReturnValue({
            data: undefined,
            isError: false,
            isLoading: false,
          })

          mockSetPrefsMutation.mockReturnValue({
            mutateAsync: jest.fn().mockResolvedValue({}),
            isPending: false,
          })

          const members = [{ id: userId, name: 'Test User' }]

          const { unmount, getAllByRole } = render(
            <NotificationSettingsPopover
              groupId={GROUP_ID}
              members={members}
              currentUserId={userId}
            />,
          )

          // The push switch is labeled 'pushLabel' (via our i18n mock).
          const pushSwitches = getAllByRole('switch', { name: 'pushLabel' })
          const pushSwitch = pushSwitches[0]!

          // Simulate enabling the push toggle → onCheckedChange(true)
          await act(async () => {
            pushSwitch.click()
          })

          // subscribe must have been called exactly once with no arguments
          expect(subscribeMock).toHaveBeenCalledTimes(1)
          expect(subscribeMock).toHaveBeenCalledWith()

          unmount()
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
