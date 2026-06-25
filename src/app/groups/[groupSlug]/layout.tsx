import { cached } from '@/app/cached-functions'
import { createTRPCContext } from '@/trpc/init'
import { appRouter } from '@/trpc/routers/_app'
import { TRPCError } from '@trpc/server'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PropsWithChildren } from 'react'
import { GroupLayoutClient } from './layout.client'

type Props = {
  params: Promise<{
    groupSlug: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupSlug } = await params
  const group = await cached.getGroupBySlug(groupSlug)

  return {
    title: {
      default: group?.name ?? '',
      template: `%s · ${group?.name} · Knots`,
    },
  }
}

export default async function GroupLayout({
  children,
  params,
}: PropsWithChildren<Props>) {
  const { groupSlug } = await params

  // Resolve slug to group
  const group = await cached.getGroupBySlug(groupSlug)
  if (!group) {
    notFound()
  }

  try {
    const ctx = await createTRPCContext()
    const result = await appRouter
      .createCaller(ctx)
      .groups.get({ groupId: group.id })
    if (!result.group) {
      notFound()
    }
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
      notFound()
    }
    throw error
  }

  return (
    <GroupLayoutClient groupId={group.id} groupSlug={groupSlug}>
      {children}
    </GroupLayoutClient>
  )
}
