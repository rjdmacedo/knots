/**
 * One-time migration script to create Users and GroupMemberships
 * for existing production groups.
 *
 * Run inside the container with:
 *   npx tsx prisma/migrate-users.ts
 *
 * Both users get password "Password1" (meets validation: uppercase, lowercase, digit, 8+ chars).
 * They are pre-verified so they can log in immediately.
 * After first login, users should change their password.
 */

import { PrismaClient } from '@prisma/client'
import { hashSync } from 'bcrypt'

const prisma = new PrismaClient()

const PASSWORD = 'Password1'
const PASSWORD_HASH = hashSync(PASSWORD, 12)

const USERS = [
  { name: 'Rafael Macedo', email: 'rafaelmacedo4@gmail.com' },
  { name: 'Ana Ferreira', email: 'ana.rcferreira@sapo.pt' },
]

async function main() {
  console.log('Migration: Creating users...')

  // Create users (skip if already exist)
  const users = await Promise.all(
    USERS.map(async (u) => {
      const existing = await prisma.user.findUnique({ where: { email: u.email } })
      if (existing) {
        console.log(`  User ${u.email} already exists, skipping.`)
        return existing
      }
      const user = await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          passwordHash: PASSWORD_HASH,
          emailVerified: new Date(),
        },
      })
      console.log(`  Created user: ${u.name} (${u.email})`)
      return user
    }),
  )

  // Get all groups
  const groups = await prisma.group.findMany({ select: { id: true, name: true } })
  console.log(`\nMigration: Found ${groups.length} groups: ${groups.map((g) => g.name).join(', ')}`)

  // Add both users to all groups
  for (const user of users) {
    for (const group of groups) {
      const existing = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: user.id, groupId: group.id } },
      })
      if (existing) {
        console.log(`  ${user.email} already member of "${group.name}", skipping.`)
        continue
      }
      await prisma.groupMembership.create({
        data: { userId: user.id, groupId: group.id },
      })
      console.log(`  Added ${user.email} to "${group.name}"`)
    }
  }

  console.log(`\nMigration complete! Both users can log in with password: ${PASSWORD}`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
