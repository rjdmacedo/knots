import { PrismaClient, SplitMode } from '@prisma/client'
import { hashSync } from 'bcrypt'

const prisma = new PrismaClient()

// Pre-hashed password for all seed users: "Password1"
const SEED_PASSWORD_HASH = hashSync('Password1', 12)

const AMOUNT_CENTS = 1000 // 10,00 €
const EXPENSES_PER_GROUP = 10

// Resend test inboxes — see https://resend.com/docs/dashboard/emails/send-test-emails
const SEED_USERS = [
  {
    id: 'seed-user-rafael',
    email: 'delivered+rafael@resend.dev',
    name: 'Rafael',
    username: 'rafael',
  },
  {
    id: 'seed-user-alice',
    email: 'delivered+alice@resend.dev',
    name: 'Alice',
    username: 'alice',
  },
  {
    id: 'seed-user-bob',
    email: 'delivered+bob@resend.dev',
    name: 'Bob',
    username: 'bob',
  },
  {
    id: 'seed-user-carol',
    email: 'delivered+carol@resend.dev',
    name: 'Carol',
    username: 'carol',
  },
  {
    id: 'seed-user-dave',
    email: 'delivered+dave@resend.dev',
    name: 'Dave',
    username: 'dave',
  },
] as const

function expenseDateForIndex(index: number): Date {
  // Fixed timeline: one expense per day starting 2025-01-10, going backwards
  return new Date(Date.UTC(2025, 0, 10 - index))
}

async function createExpensesPaidBy(
  groupId: string | null,
  participants: ReadonlyArray<{ id: string }>,
  groupSlug: string,
  paidById: string,
) {
  for (let i = 0; i < EXPENSES_PER_GROUP; i++) {
    const expenseId = `seed-expense-${groupSlug}-${i}`

    const expense = await prisma.expense.create({
      data: {
        id: expenseId,
        groupId: groupId ?? undefined,
        title: `Despesa ${i + 1}`,
        categoryId: 0,
        expenseDate: expenseDateForIndex(i),
        amount: AMOUNT_CENTS,
        paidById,
        splitMode: SplitMode.EVENLY,
        isReimbursement: false,
      },
    })

    await prisma.expensePaidFor.createMany({
      data: participants.map((participant) => ({
        expenseId: expense.id,
        userId: participant.id,
        shares: 1,
      })),
    })
  }
}

async function main() {
  console.log('Seed: clearing existing data...')

  await prisma.expensePaidFor.deleteMany()
  await prisma.expenseDocument.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.recurringExpenseLink.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.groupMembership.deleteMany()
  await prisma.invitation.deleteMany()
  await prisma.token.deleteMany()
  await prisma.session.deleteMany()
  await prisma.account.deleteMany()
  await prisma.rateLimitAttempt.deleteMany()
  await prisma.friend.deleteMany()
  await prisma.blockedUser.deleteMany()
  await prisma.user.deleteMany()
  await prisma.group.deleteMany()

  console.log('Seed: creating users...')

  const users = await Promise.all(
    SEED_USERS.map((user) =>
      prisma.user.create({
        data: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          passwordHash: SEED_PASSWORD_HASH,
          emailVerified: new Date('2025-01-01T00:00:00.000Z'),
          preferredCurrency: 'EUR',
        },
      }),
    ),
  )

  const userById = Object.fromEntries(users.map((user) => [user.id, user]))
  const rafael = userById['seed-user-rafael']!
  const alice = userById['seed-user-alice']!
  const bob = userById['seed-user-bob']!
  const carol = userById['seed-user-carol']!
  const dave = userById['seed-user-dave']!

  console.log(
    `Seed: created ${users.length} users (${SEED_USERS.map((user) => user.email).join(', ')})`,
  )
  console.log('Seed: all users have password "Password1"')

  console.log('Seed: creating friendships (everyone ↔ everyone)...')

  const friendRecords = users.flatMap((owner) =>
    users
      .filter((target) => target.id !== owner.id)
      .map((target) => ({
        userId: owner.id,
        email: target.email,
        friendUserId: target.id,
        name: target.name,
      })),
  )

  await prisma.friend.createMany({ data: friendRecords })

  console.log(`Seed: created ${friendRecords.length} friend records`)

  console.log('Seed: creating groups...')

  const group1 = await prisma.group.create({
    data: {
      id: 'seed-group-1',
      name: 'Grupo Rafael, Alice e Bob',
      information: 'Grupo de teste com Rafael, Alice e Bob',
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  const group2 = await prisma.group.create({
    data: {
      id: 'seed-group-2',
      name: 'Grupo Rafael, Carol e Dave',
      information: 'Grupo de teste com Rafael, Carol e Dave',
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  await prisma.groupMembership.createMany({
    data: [
      // Members of Group 1
      {
        userId: rafael.id,
        groupId: group1.id,
        role: 'OWNER' as const,
      },
      {
        userId: alice.id,
        groupId: group1.id,
        role: 'MEMBER' as const,
      },
      {
        userId: bob.id,
        groupId: group1.id,
        role: 'MEMBER' as const,
      },
      // Members of Group 2
      {
        userId: rafael.id,
        groupId: group2.id,
        role: 'OWNER' as const,
      },
      {
        userId: carol.id,
        groupId: group2.id,
        role: 'MEMBER' as const,
      },
      {
        userId: dave.id,
        groupId: group2.id,
        role: 'MEMBER' as const,
      },
    ],
  })

  console.log(
    'Seed: creating expenses (10,00 € each, Rafael pays all — creates settlements)...',
  )

  // Rafael pays every expense so others owe him a round amount per group.
  await createExpensesPaidBy(
    group1.id,
    [rafael, alice, bob],
    'group-1',
    rafael.id,
  )
  await createExpensesPaidBy(
    group2.id,
    [rafael, carol, dave],
    'group-2',
    rafael.id,
  )
  await createExpensesPaidBy(
    null,
    [rafael, alice],
    'direct-rafael-alice',
    rafael.id,
  )
  await createExpensesPaidBy(
    null,
    [rafael, bob],
    'direct-rafael-bob',
    rafael.id,
  )

  const totalExpenses = EXPENSES_PER_GROUP * 4
  const directDebt = (EXPENSES_PER_GROUP * AMOUNT_CENTS) / 2 // 50,00 €
  const groupDebt = (EXPENSES_PER_GROUP * AMOUNT_CENTS) / 3 // ~33,33 €

  console.log(`Seed: created ${totalExpenses} expenses across 4 contexts`)
  console.log('')
  console.log('Quick reference (Rafael is creditor everywhere):')
  console.log(`  • Direct: Alice/Bob each owe Rafael ${directDebt / 100},00 €`)
  console.log(
    `  • Grupo 1: Alice/Bob each owe Rafael ${Math.round(groupDebt) / 100} €`,
  )
  console.log(
    `  • Grupo 2: Carol/Dave each owe Rafael ${Math.round(groupDebt) / 100} €`,
  )
  console.log(
    `  • Friend balance Rafael–Alice: ${Math.round(directDebt + groupDebt) / 100} €`,
  )
  console.log(
    `  • Friend balance Rafael–Bob: ${Math.round(directDebt + groupDebt) / 100} €`,
  )
  console.log(
    `  • Friend balance Rafael–Carol: ${Math.round(groupDebt) / 100} €`,
  )
  console.log(
    `  • Friend balance Rafael–Dave: ${Math.round(groupDebt) / 100} €`,
  )
}

main()
  .catch((error) => {
    console.error('Seed: error seeding database', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
