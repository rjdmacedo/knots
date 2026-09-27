/**
 * Property-based tests for GroupNotificationToggle — Bell icon state.
 *
 * Feature: unified-group-notifications
 * - Property 1: Bell icon reflects channel state
 *
 * Kept in a separate file so the heavy popover/tooltip/button mocks (needed
 * to shallow-render GroupNotificationToggle in isolation) don't interfere with
 * the NotificationSettingsPopover render tests in the sibling file.
 *
 * Validates: Requirements 1.4
 */

import '@testing-library/jest-dom'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

jest.mock('@/lib/push/use-push-notification-subscription', () => ({
  isPushSupported: jest.fn().mockReturnValue(false),
  usePushNotificationSubscription: jest.fn(),
}))

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

jest.mock('@/components/ui/toast', () => ({
  toast: { error: jest.fn(), warning: jest.fn() },
}))

// Collapse the popover panel so we only render the trigger button + icon.
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ render: r }: { render?: React.ReactElement }) => r ?? null,
  PopoverContent: () => null,
}))

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({
    children,
    render: r,
  }: {
    children?: React.ReactNode
    render?: React.ReactElement
  }) => React.createElement(React.Fragment, null, children, r),
  TooltipContent: () => null,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string
    size?: string
  }) => React.createElement('button', rest, children),
}))

// The popover panel is collapsed above; mock the component for completeness.
jest.mock('@/components/notification-settings-popover', () => ({
  NotificationSettingsPopover: () => null,
}))

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useId: () => 'test-id',
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

let GroupNotificationToggle: React.ComponentType<{
  groupId: string
  members: Array<{ id: string; name: string }>
  currentUserId: string | undefined
}>

beforeAll(async () => {
  const mod = await import('../group-notification-toggle')
  GroupNotificationToggle = mod.GroupNotificationToggle
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
// P1: Bell icon reflects channel state
// ---------------------------------------------------------------------------

/**
 * The bell opens per-group filters. Channel state lives in account settings,
 * so the icon is always Bell.
 */
describe('Property 1: Bell icon opens group notification filters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('always renders Bell', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), () => {
        const { unmount, container } = render(
          <GroupNotificationToggle
            groupId={GROUP_ID}
            members={MEMBERS}
            currentUserId={USER_ID}
          />,
        )

        const bell = container.querySelector(
          '.lucide-bell:not(.lucide-bell-off)',
        )
        const bellOff = container.querySelector('.lucide-bell-off')

        expect(bell).toBeInTheDocument()
        expect(bellOff).not.toBeInTheDocument()

        unmount()
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
