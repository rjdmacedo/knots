import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

Object.defineProperty(window, 'PointerEvent', {
  configurable: true,
  value: MouseEvent,
})

const mockSetData = jest.fn()
const mockSave = jest.fn()
const mockReset = jest.fn()
const mockQuery = jest.fn()

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

jest.mock('@/lib/push/push-availability', () => ({
  detectPushDisabledReason: () => null,
}))

jest.mock('@/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      groupMembership: {
        getGroupNotificationPreferences: {
          setData: (...args: unknown[]) => mockSetData(...args),
        },
      },
    }),
    groupMembership: {
      getGroupNotificationPreferences: {
        useQuery: (...args: unknown[]) => mockQuery(...args),
      },
      saveGroupNotificationCategory: {
        useMutation: () => ({
          mutateAsync: (...args: unknown[]) => mockSave(...args),
        }),
      },
      resetGroupNotificationPreferences: {
        useMutation: () => ({
          mutateAsync: (...args: unknown[]) => mockReset(...args),
        }),
      },
    },
  },
}))

import { NotificationSettingsPopover } from '../notification-settings-popover'

const inheritedPreferences = {
  notificationsEnabled: true,
  categories: {
    'expense-created': { email: true, push: true, isOverride: false },
    'recurring-expense-created': {
      email: true,
      push: false,
      isOverride: false,
    },
    'expense-changed': { email: false, push: false, isOverride: false },
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockQuery.mockReturnValue({
    data: inheritedPreferences,
    isLoading: false,
    isError: false,
  })
})

describe('group notification overrides', () => {
  it('shows the three expense categories and no member filters', () => {
    render(
      <NotificationSettingsPopover
        groupId="group-1"
        currentUserId="user-1"
        emailVerified
      />,
    )

    expect(
      screen.getByText('notifications.categories.expense-created'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('notifications.categories.recurring-expense-created'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('notifications.categories.expense-changed'),
    ).toBeInTheDocument()
    expect(screen.queryByText('membersLabel')).not.toBeInTheDocument()
    expect(screen.queryByText('notifySpecificMembers')).not.toBeInTheDocument()
  })

  it('saves a category override when a channel changes', async () => {
    mockSave.mockResolvedValue({
      ...inheritedPreferences,
      categories: {
        ...inheritedPreferences.categories,
        'expense-created': {
          email: false,
          push: true,
          isOverride: true,
        },
      },
    })

    render(
      <NotificationSettingsPopover
        groupId="group-1"
        currentUserId="user-1"
        emailVerified
      />,
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', {
        name: 'notifications.channelLabel.email',
      })[0],
    )

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        groupId: 'group-1',
        category: 'expense-created',
        email: false,
        push: true,
      }),
    )
  })

  it('enables reset only when a group override exists', () => {
    const { rerender } = render(
      <NotificationSettingsPopover
        groupId="group-1"
        currentUserId="user-1"
        emailVerified
      />,
    )

    expect(screen.getByRole('button', { name: 'followAccount' })).toBeDisabled()

    mockQuery.mockReturnValue({
      data: {
        ...inheritedPreferences,
        categories: {
          ...inheritedPreferences.categories,
          'expense-created': {
            email: false,
            push: true,
            isOverride: true,
          },
        },
      },
      isLoading: false,
      isError: false,
    })

    rerender(
      <NotificationSettingsPopover
        groupId="group-1"
        currentUserId="user-1"
        emailVerified
      />,
    )

    expect(screen.getByRole('button', { name: 'followAccount' })).toBeEnabled()
  })
})
