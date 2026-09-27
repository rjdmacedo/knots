'use client'

import { Button } from '@/components/ui/button'
import type { Locale } from '@/i18n'
import { trpc } from '@/trpc/client'
import { ArrowLeft, AtSign, LogOut, ShieldOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { AccountEmailSettings } from './account-email-settings'
import { AccountPasskeySettings } from './account-passkey-settings'
import { AccountPasswordSettings } from './account-password-settings'
import { AccountPreferences } from './account-preferences'
import { ProfileSection } from './account-profile-form'
import { BlockedUsers } from './blocked-users'
import { NotificationsPreferences } from './notifications-preferences'
import { SettingsList, SettingsRow, SettingsSection } from './settings-ui'
import { SignOutAllButton } from './sign-out-all-button'
import { SignOutButton } from './sign-out-button'
import { ThisDevicePush } from './this-device-push'
import { UsernameChangeForm } from './username-change-form'

/**
 * Data loaded by the server component and handed to the client body.
 * `page.tsx` stays a server component (`requireSession` + `profile.getProfile`)
 * and passes this profile in.
 */
export interface SettingsPageProfile {
  id: string
  email: string
  name: string
  username: string
  timezone: string | null
  preferredCurrency: string | null
  image: string | null
  locale: Locale | null
  theme: string | null
  notificationsEnabled: boolean
  emailVerified: Date | null
  hasPassword: boolean
}

/**
 * Client body for `/account/settings`.
 *
 * Task 5.1 scope: the loader split, one visible `h1`, a back button, and the
 * section scaffold in the Requirement 2 order (Profile, App preferences,
 * Notifications, then Username, Blocked users, Account). Section bodies wire to
 * the existing forms as placeholders. Later tasks (5.2, 5.3, 6.x, 7.x, 8.x)
 * replace the placeholders with photo upload, email/passkey dialogs, autosaved
 * preferences, and notification channels.
 */
export function SettingsPage({ profile }: { profile: SettingsPageProfile }) {
  const t = useTranslations('ProfileSettings')
  const router = useRouter()

  // The password row shows Remove only when a password and a passkey both
  // exist. The passkey component owns its own list; sharing the same
  // query here keeps the count in sync without a second request.
  const passkeyList = trpc.passkey.list.useQuery()
  const passkeyCount = passkeyList.data?.length ?? 0

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
      return
    }
    router.push('/')
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleBack}
          // Back button is visible from `sm` up (req 2.4). The h1 stays
          // visible at all breakpoints (req 2.5).
          className="hidden sm:inline-flex"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">{t('back')}</span>
        </Button>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>

      {/* Section order from Requirement 2. */}

      {/* Profile: photo + name (task 5.2) plus email/password placeholders as
          rows outside the form (task 5.3 replaces those). */}
      <ProfileSection
        name={profile.name}
        image={profile.image}
        credentialRows={
          <>
            <AccountEmailSettings email={profile.email} />
            <AccountPasswordSettings
              passkeyCount={passkeyCount}
              hasPassword={profile.hasPassword}
            />
            <AccountPasskeySettings hasPassword={profile.hasPassword} />
          </>
        }
      />

      {/* App preferences (task 6.1): autosaved rows with a saving header. */}
      <AccountPreferences
        timezone={profile.timezone}
        preferredCurrency={profile.preferredCurrency}
        locale={profile.locale}
        theme={profile.theme}
      />

      {/* Notifications (task 7.3): master switch + per-category channel rows.
          The This device group (task 7.4) fills `deviceSlot`. */}
      <NotificationsPreferences
        notificationsEnabled={profile.notificationsEnabled}
        emailVerified={profile.emailVerified}
        deviceSlot={<ThisDevicePush currentUserId={profile.id} />}
      />

      {/* Username: a field row that keeps `profile.changeUsername`. */}
      <SettingsSection icon={AtSign} title={t('usernameTitle')}>
        <SettingsList>
          <UsernameChangeForm currentUsername={profile.username} />
        </SettingsList>
      </SettingsSection>

      {/* Blocked users: the manage dialog sits in a row within the chrome. */}
      <SettingsSection
        icon={ShieldOff}
        title={t('blockedUsersTitle')}
        description={t('blockedUsersDescription')}
      >
        <SettingsList>
          <SettingsRow
            label={t('blockedUsersRowLabel')}
            description={t('blockedUsersRowDescription')}
            control={<BlockedUsers />}
          />
        </SettingsList>
      </SettingsSection>

      {/* Account (sign out): each action is its own row. */}
      <SettingsSection icon={LogOut} title={t('accountTitle')}>
        <SettingsList>
          <SettingsRow
            label={t('signOut')}
            description={t('signOutDescription')}
            control={<SignOutButton />}
          />
          <SettingsRow
            label={t('signOutAllTitle')}
            description={t('signOutAllDescription')}
            control={<SignOutAllButton />}
          />
        </SettingsList>
      </SettingsSection>
    </>
  )
}
