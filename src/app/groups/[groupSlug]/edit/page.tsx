import { EditGroup } from '@/app/groups/[groupSlug]/edit/edit-group'
import { auth } from '@/lib/auth/auth'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Settings',
}

export default async function EditGroupPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  return <EditGroup currentUserId={session.user.id} />
}
