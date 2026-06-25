import { GroupType, PrismaClient, SplitMode } from '@prisma/client'
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

function buildDyadKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':')
}

function expenseDateForIndex(index: number): Date {
  // Fixed timeline: one expense per day starting 2025-01-10, going backwards
  return new Date(Date.UTC(2025, 0, 10 - index))
}

async function createExpensesPaidBy(
  groupId: string,
  participants: ReadonlyArray<{ id: string }>,
  groupSlug: string,
  paidById: string,
) {
  for (let i = 0; i < EXPENSES_PER_GROUP; i++) {
    const expenseId = `seed-expense-${groupSlug}-${i}`

    const expense = await prisma.expense.create({
      data: {
        id: expenseId,
        groupId,
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

  const demoGroup = await prisma.group.create({
    data: {
      id: 'seed-group-demo',
      name: 'Demo group',
      type: GroupType.STANDARD,
      information: '5 membros, 10 despesas de 10,00 €',
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  const rafaelBobDyadGroup = await prisma.group.create({
    data: {
      id: 'seed-group-dyad-rafael-bob',
      name: 'Bob',
      type: GroupType.DYAD,
      dyadKey: buildDyadKey(rafael.id, bob.id),
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  const dyadGroup = await prisma.group.create({
    data: {
      id: 'seed-group-dyad-rafael-alice',
      name: 'Alice',
      type: GroupType.DYAD,
      dyadKey: buildDyadKey(rafael.id, alice.id),
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  await prisma.groupMembership.createMany({
    data: [
      ...users.map((user) => ({
        userId: user.id,
        groupId: demoGroup.id,
        role: user.id === rafael.id ? ('OWNER' as const) : ('MEMBER' as const),
      })),
      ...[rafael, bob].map((user) => ({
        userId: user.id,
        groupId: rafaelBobDyadGroup.id,
        role: user.id === rafael.id ? ('OWNER' as const) : ('MEMBER' as const),
      })),
      {
        userId: rafael.id,
        groupId: dyadGroup.id,
        role: 'OWNER' as const,
      },
      {
        userId: alice.id,
        groupId: dyadGroup.id,
        role: 'MEMBER' as const,
      },
    ],
  })

  console.log(
    'Seed: creating expenses (10,00 € each, Rafael pays all — creates settlements)...',
  )

  // Rafael pays every expense so others owe him a round amount per group.
  await createExpensesPaidBy(demoGroup.id, users, 'demo', rafael.id)
  await createExpensesPaidBy(
    dyadGroup.id,
    [rafael, alice],
    'dyad-rafael-alice',
    rafael.id,
  )
  await createExpensesPaidBy(
    rafaelBobDyadGroup.id,
    [rafael, bob],
    'dyad-rafael-bob',
    rafael.id,
  )

  const totalExpenses = EXPENSES_PER_GROUP * 3
  const dyadDebt = (EXPENSES_PER_GROUP * AMOUNT_CENTS) / 2 // 50,00 €
  const demoDebt =
    EXPENSES_PER_GROUP * (AMOUNT_CENTS - AMOUNT_CENTS / users.length) // 80,00 €

  console.log(`Seed: created ${totalExpenses} expenses across 3 groups`)
  console.log('')
  console.log('Quick reference (Rafael is creditor everywhere):')
  console.log(`  • Dyad: Alice/Bob each owe Rafael ${dyadDebt / 100},00 €`)
  console.log(
    `  • Demo: Alice/Bob/Carol/Dave each owe Rafael ${demoDebt / 100},00 €`,
  )
  console.log(
    `  • Friend balance Rafael–Alice: ${(dyadDebt + demoDebt) / 100},00 € (50 + 80)`,
  )
  console.log(
    `  • Friend balance Rafael–Bob: ${(dyadDebt + demoDebt) / 100},00 € (50 + 80)`,
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
