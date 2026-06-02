import { auth } from '@/lib/auth/auth'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { redirect } from 'next/navigation'
import { BlockedUsers } from './blocked-users'
import { NameChangeForm } from './name-change-form'
import { PasswordChangeForm } from './password-change-form'
import { ProfilePreferences } from './profile-preferences'
import { SignOutAllButton } from './sign-out-all-button'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = {
  title: 'Profile Settings',
}

export default async function ProfileSettingsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/settings')
  }

  const ctx = await createTRPCContext()
  const caller = appRouter.createCaller(ctx)
  const profile = await caller.profile.getProfile()

  return (
    <ProfileSettingsContent
      email={profile.email}
      name={profile.name}
      timezone={profile.timezone}
      preferredCurrency={profile.preferredCurrency}
    />
  )
}

function ProfileSettingsContent({
  email,
  name,
  timezone,
  preferredCurrency,
}: {
  email: string
  name: string
  timezone: string | null
  preferredCurrency: string | null
}) {
  const t = useTranslations('ProfileSettings')

  return (
    <>
      <h1 className="font-bold text-2xl">{t('title')}</h1>

      <div className="flex flex-col gap-6">
        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('emailTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('emailDescription')}
          </p>
          <div className="text-sm font-medium">{email}</div>
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('displayNameTitle')}</h2>
          <NameChangeForm currentName={name} />
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('passwordTitle')}</h2>
          <PasswordChangeForm />
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('preferencesTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('preferencesDescription')}
          </p>
          <ProfilePreferences
            timezone={timezone}
            preferredCurrency={preferredCurrency}
          />
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('blockedUsersTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('blockedUsersDescription')}
          </p>
          <BlockedUsers />
        </section>

        <section className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-lg">{t('accountTitle')}</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SignOutButton />
            <SignOutAllButton />
          </div>
        </section>
      </div>
    </>
  )
}
