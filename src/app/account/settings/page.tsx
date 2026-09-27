import type { Locale } from '@/i18n'
import { requireSession } from '@/lib/auth/require-session'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { Metadata } from 'next'
import { SettingsPage } from './settings-page'

export const metadata: Metadata = {
  title: 'Profile Settings',
}

export default async function AccountSettingsPage() {
  await requireSession({ callbackUrl: '/account/settings' })

  const ctx = await createTRPCContext()
  const caller = appRouter.createCaller(ctx)
  const profile = await caller.profile.getProfile()

  return (
    <SettingsPage
      profile={{
        id: profile.id,
        email: profile.email,
        name: profile.name,
        username: profile.username,
        timezone: profile.timezone,
        preferredCurrency: profile.preferredCurrency,
        image: profile.image,
        locale: profile.locale as Locale | null,
        theme: profile.theme,
        notificationsEnabled: profile.notificationsEnabled,
        emailVerified: profile.emailVerified,
        hasPassword: profile.hasPassword,
      }}
    />
  )
}
