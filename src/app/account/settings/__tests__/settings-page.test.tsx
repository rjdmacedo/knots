/**
 * Behavior tests for the account settings page (task 5.4).
 *
 * Feature: account-settings-page
 * - One `h1`, and section `h2`s in the Requirement 2 order:
 *   Profile, App preferences, Notifications, Username, Blocked users, Account.
 * - The profile Save changes button is disabled when the trimmed name equals
 *   the saved name and enabled once it differs (and disabled again on revert).
 *
 * Validates: Requirements 1.5, 2.1, 4.2
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

// next-intl: return the key so headings assert against literal key names, and
// give a stable locale for any consumer.
jest.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => 'en-US',
}))

// next/navigation: the page and the profile form call useRouter.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

// Toast: no-op with the shape used by the profile form.
jest.mock('@/components/ui/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

// tRPC client: a recursive proxy so any `trpc.<router>.<proc>.useQuery` /
// `.useMutation` and `trpc.useUtils()....invalidate()` resolve to safe stubs.
// Queries return an empty, successful result; mutations expose a resolving
// mutateAsync and isPending=false. Keeps the render deterministic without a
// real query client.
jest.mock('@/trpc/client', () => {
  const query = () => ({ data: [], isSuccess: true, isLoading: false })
  const mutation = () => ({
    mutateAsync: jest.fn().mockResolvedValue({}),
    mutate: jest.fn(),
    isPending: false,
  })
  const makeProxy = (): unknown =>
    new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'useQuery') return query
        if (prop === 'useMutation') return mutation
        if (prop === 'useUtils') return () => makeProxy()
        if (prop === 'invalidate' || prop === 'setData' || prop === 'refetch') {
          return jest.fn()
        }
        return makeProxy()
      },
      apply() {
        return makeProxy()
      },
    })
  return { trpc: makeProxy() }
})

// Isolate SettingsPage + ProfileSection (which owns the name input and the
// Save changes button). The sibling credential rows and the other sections
// pull in next-themes, WebAuthn, and push hooks that are irrelevant to the
// heading order and the save-button behavior, so we render them as markers.
jest.mock('../account-email-settings', () => ({
  AccountEmailSettings: () => <div data-testid="email-settings" />,
}))
jest.mock('../account-password-settings', () => ({
  AccountPasswordSettings: () => <div data-testid="password-settings" />,
}))
jest.mock('../account-passkey-settings', () => ({
  AccountPasskeySettings: () => <div data-testid="passkey-settings" />,
}))
// App preferences and Notifications sections pull in `@/i18n` (which imports
// `next-intl/server`), `next-themes`, WebAuthn, and push hooks. None of that is
// relevant to the heading order or the save-button behavior, so we render them
// as `h2` markers that reproduce the section titles the real sections emit
// (mocked `useTranslations('ProfileSettings')` -> `ProfileSettings.<key>`).
jest.mock('../account-preferences', () => ({
  AccountPreferences: () => (
    <section>
      <h2>ProfileSettings.appPreferencesTitle</h2>
    </section>
  ),
}))
jest.mock('../notifications-preferences', () => ({
  NotificationsPreferences: () => (
    <section>
      <h2>ProfileSettings.notificationsTitle</h2>
    </section>
  ),
}))
jest.mock('../this-device-push', () => ({
  ThisDevicePush: () => <div data-testid="this-device-push" />,
}))
jest.mock('../blocked-users', () => ({
  BlockedUsers: () => <div data-testid="blocked-users" />,
}))
jest.mock('../username-change-form', () => ({
  UsernameChangeForm: () => <div data-testid="username-change-form" />,
}))
jest.mock('../sign-out-button', () => ({
  SignOutButton: () => <button type="button">sign-out</button>,
}))
jest.mock('../sign-out-all-button', () => ({
  SignOutAllButton: () => <button type="button">sign-out-all</button>,
}))

import { SettingsPage, type SettingsPageProfile } from '../settings-page'

const sampleProfile: SettingsPageProfile = {
  id: 'user-rafael',
  email: 'rafael@example.com',
  name: 'Rafael',
  username: 'rafael',
  timezone: 'Europe/Lisbon',
  preferredCurrency: 'EUR',
  image: null,
  locale: 'en-US',
  theme: 'system',
  notificationsEnabled: true,
  emailVerified: new Date('2024-01-01'),
  hasPassword: true,
}

// The section titles map to these translation keys (mocked useTranslations
// returns `${namespace}.${key}`; SettingsPage uses `useTranslations('ProfileSettings')`).
const EXPECTED_H2_ORDER = [
  'ProfileSettings.profileTitle',
  'ProfileSettings.appPreferencesTitle',
  'ProfileSettings.notificationsTitle',
  'ProfileSettings.usernameTitle',
  'ProfileSettings.blockedUsersTitle',
  'ProfileSettings.accountTitle',
]

describe('SettingsPage headings (Requirements 1.5, 2.1)', () => {
  it('renders exactly one h1', () => {
    render(<SettingsPage profile={sampleProfile} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders the h2 section titles in the Requirement 2 order', () => {
    render(<SettingsPage profile={sampleProfile} />)
    const h2Texts = screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent)
    expect(h2Texts).toEqual(EXPECTED_H2_ORDER)
  })
})

describe('Profile Save changes button (Requirement 4.2)', () => {
  function getSaveButton() {
    return screen.getByRole('button', {
      name: /ProfileSettings\.Profile\.saveChanges/,
    })
  }

  function getNameInput() {
    return screen.getByRole('textbox', {
      name: /ProfileSettings\.Profile\.nameLabel/,
    })
  }

  it('is disabled when the name equals the saved name and toggles with edits', () => {
    render(<SettingsPage profile={sampleProfile} />)

    const save = getSaveButton()
    const input = getNameInput()

    // Initially clean: name === saved name.
    expect(save).toBeDisabled()

    // Editing to a different value enables it.
    fireEvent.change(input, { target: { value: 'Rafael Macedo' } })
    expect(save).toBeEnabled()

    // Reverting to the saved value disables it again.
    fireEvent.change(input, { target: { value: 'Rafael' } })
    expect(save).toBeDisabled()
  })

  it('stays disabled when the edit only adds surrounding whitespace', () => {
    render(<SettingsPage profile={sampleProfile} />)

    const save = getSaveButton()
    const input = getNameInput()

    // Trimmed name still equals the saved name, so no change.
    fireEvent.change(input, { target: { value: '  Rafael  ' } })
    expect(save).toBeDisabled()
  })
})
