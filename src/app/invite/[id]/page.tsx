import { auth } from '@/lib/auth/auth'
import { redirect } from 'next/navigation'
import { InviteAcceptanceClient } from './invite-acceptance-client'

interface InvitePageProps {
  params: Promise<{ id: string }>
}

/**
 * Invitation acceptance page at /invite/[id].
 * - If user is not authenticated, middleware redirects to /login?callbackUrl=/invite/[id]
 * - If authenticated, shows the acceptance UI with the user's email
 *
 * Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.8
 */
export default async function InvitePage({ params }: InvitePageProps) {
  const { id } = await params
  const session = await auth()

  // This should not happen since middleware protects this route,
  // but as a safety net, redirect to login with callbackUrl
  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=/invite/${encodeURIComponent(id)}`)
  }

  return (
    <div className="container max-w-md mx-auto py-8">
      <InviteAcceptanceClient
        invitationId={id}
        userEmail={session.user.email}
      />
    </div>
  )
}
