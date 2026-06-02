import { auth } from '@/lib/auth/auth'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { redirect } from 'next/navigation'
import { NameChangeForm } from './name-change-form'
import { PasswordChangeForm } from './password-change-form'

export const metadata: Metadata = {
  title: 'Profile Settings',
}

/**
 * Profile settings page at /settings.
 * - Middleware protects this route (redirects unauthenticated users to /login)
 * - Fetches user profile via tRPC server-side caller
 * - Displays current name and email (read-only)
 * - Includes NameChangeForm and PasswordChangeForm client components
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export default async function ProfileSettingsPage() {
  const session = await auth()

  // Safety net: middleware should handle this, but redirect if unauthenticated
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/settings')
  }

  const ctx = await createTRPCContext()
  const caller = appRouter.createCaller(ctx)
  const profile = await caller.profile.getProfile()

  return <ProfileSettingsContent email={profile.email} name={profile.name} />
}

function ProfileSettingsContent({ email, name }: { email: string; name: string }) {
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
      </div>
    </>
  )
}
