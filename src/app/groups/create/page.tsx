import { CreateGroup } from '@/app/groups/create/create-group'
import { requireSession } from '@/lib/auth/require-session'
import { currencyForUser } from '@/lib/currency'
import { prisma } from '@/lib/prisma'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Group',
}

export default async function CreateGroupPage() {
  const session = await requireSession({ callbackUrl: '/groups/create' })
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredCurrency: true },
  })

  return (
    <CreateGroup
      defaultCurrencyCode={currencyForUser(user?.preferredCurrency).code}
    />
  )
}
