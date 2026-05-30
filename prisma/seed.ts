import { faker } from '@faker-js/faker'
import { PrismaClient, SplitMode } from '@prisma/client'
import { sample } from 'lodash-es'
import { randomUUID } from 'node:crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('Seed: clearing existing data...')

  // Order matters because of foreign key relations
  await prisma.expensePaidFor.deleteMany()
  await prisma.expenseDocument.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.recurringExpenseLink.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.participant.deleteMany()
  await prisma.group.deleteMany()

  console.log('Seed: creating demo data...')

  // Categories are seeded by migrations — reference them by their stable IDs
  const categoryIds = {
    general: 0,
    diningOut: 8,
    groceries: 9,
    sports: 6,
    movies: 4,
    fuel: 31,
  } as const

  // Demo group
  const groupId = randomUUID()
  const group = await prisma.group.create({
    data: {
      id: groupId,
      name: 'Demo group',
      information: 'Example data for local development',
      currency: '€',
      currencyCode: 'EUR',
    },
  })

  // Participants with random names
  const participants = await Promise.all(
    Array.from({ length: 3 }).map(() =>
      prisma.participant.create({
        data: {
          id: randomUUID(),
          name: faker.person.firstName(),
          groupId: group.id,
        },
      }),
    ),
  )

  console.log(
    `Seed: created group "${group.name}" with participants ${participants
      .map((p) => p.name)
      .join(', ')}`,
  )

  // Helper to generate random cents between min and max euros
  const amountInCents = (min: number, max: number) =>
    Math.round(
      faker.number.float({ min, max, fractionDigits: 2 }).valueOf() * 100,
    )

  const today = new Date()

  type SeedExpenseTemplate = {
    title: string
    categoryKey: keyof typeof categoryIds
    min: number
    max: number
  }

  const expenseTemplates: SeedExpenseTemplate[] = [
    {
      title: 'Restaurante sexta à noite',
      categoryKey: 'diningOut',
      min: 25,
      max: 60,
    },
    {
      title: 'Supermercado semana',
      categoryKey: 'groceries',
      min: 40,
      max: 120,
    },
    {
      title: 'Natação',
      categoryKey: 'sports',
      min: 15,
      max: 25,
    },
    {
      title: 'Cinema + Pipocas',
      categoryKey: 'movies',
      min: 18,
      max: 35,
    },
    {
      title: 'Combustível',
      categoryKey: 'fuel',
      min: 40,
      max: 90,
    },
    {
      title: 'Almoço fora',
      categoryKey: 'diningOut',
      min: 12,
      max: 30,
    },
  ]

  const totalExpenses = faker.number.int({ min: 50, max: 100 })

  for (let i = 0; i < totalExpenses; i++) {
    const template = sample(expenseTemplates) ?? expenseTemplates[0]

    const monthsAgo = faker.number.int({ min: 0, max: 11 })
    const expenseDate = new Date(
      today.getFullYear(),
      today.getMonth() - monthsAgo,
      faker.number.int({ min: 1, max: 28 }),
    )

    const expenseId = randomUUID()
    const paidByParticipant = sample(participants) ?? participants[0]

    const categoryId = categoryIds[template.categoryKey]

    const expense = await prisma.expense.create({
      data: {
        id: expenseId,
        groupId: group.id,
        title: template.title,
        categoryId,
        expenseDate,
        amount: amountInCents(template.min, template.max),
        paidById: paidByParticipant.id,
        splitMode: SplitMode.EVENLY,
        isReimbursement: false,
      },
    })

    await prisma.expensePaidFor.createMany({
      data: participants.map((p) => ({
        expenseId: expense.id,
        participantId: p.id,
        shares: 1,
      })),
    })
  }

  console.log(`Seed: created ${totalExpenses} shared expenses`)
}

main()
  .catch((e) => {
    console.error('Seed: error seeding database', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
