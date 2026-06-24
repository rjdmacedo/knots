import { prisma } from '@/lib/prisma'
import { cache } from 'react'

const findSessionUser = cache(async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })
})

export async function resolveSessionUser(userId: string) {
  return findSessionUser(userId)
}

export function isStaleSessionError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return (
    message.includes('user not found') ||
    message.includes('session expired') ||
    message.includes('stale_session')
  )
}
