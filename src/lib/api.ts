import {
  FieldChange,
  computeExpenseChanges,
  computeGroupChanges,
} from '@/lib/activity-diff'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues, GroupFormValues } from '@/lib/schemas'
import { generateUniqueGroupSlug } from '@/lib/slugify'
import {
  ActivityType,
  Expense,
  GroupType,
  RecurrenceRule,
  RecurringExpenseLink,
} from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'

export function randomId() {
  return nanoid()
}

export async function createGroup(groupFormValues: GroupFormValues) {
  const slug = await generateUniqueGroupSlug(groupFormValues.name)
  return prisma.group.create({
    data: {
      id: randomId(),
      name: groupFormValues.name,
      slug,
      information: groupFormValues.information,
      currency: groupFormValues.currency,
      currencyCode: groupFormValues.currencyCode,
      simplifyDebts: groupFormValues.simplifyDebts,
    },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })
}

export async function createExpense(
  expenseFormValues: ExpenseFormValues,
  groupId: string,
  userId?: string,
): Promise<Expense> {
  const group = await getGroup(groupId)
  if (!group)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Group not found: ${groupId}`,
    })

  const memberIds = new Set(group.participants.map((p) => p.id))

  if (!memberIds.has(expenseFormValues.paidBy)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'paidBy user is not a group member',
    })
  }
  for (const pf of expenseFormValues.paidFor) {
    if (!memberIds.has(pf.participant)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `User ${pf.participant} is not a group member`,
      })
    }
  }

  const expenseId = randomId()
  const changes: FieldChange[] = [
    { field: 'title', oldValue: null, newValue: expenseFormValues.title },
    {
      field: 'amount',
      oldValue: null,
      newValue: String(expenseFormValues.amount),
    },
    { field: 'paidBy', oldValue: null, newValue: expenseFormValues.paidBy },
  ]

  await logActivity(groupId, ActivityType.CREATE_EXPENSE, {
    userId,
    expenseId,
    data: expenseFormValues.title,
    changes,
  })

  const isCreateRecurrence =
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE
  const recurringExpenseLinkPayload = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  return prisma.expense.create({
    data: {
      id: expenseId,
      groupId,
      expenseDate: expenseFormValues.expenseDate,
      categoryId: expenseFormValues.category,
      amount: expenseFormValues.amount,
      originalAmount: expenseFormValues.originalAmount,
      originalCurrency: expenseFormValues.originalCurrency,
      conversionRate: expenseFormValues.conversionRate,
      title: expenseFormValues.title,
      paidById: expenseFormValues.paidBy,
      splitMode: expenseFormValues.splitMode,
      recurrenceRule: expenseFormValues.recurrenceRule,
      recurringExpenseLink: {
        ...(isCreateRecurrence
          ? {
              create: recurringExpenseLinkPayload,
            }
          : {}),
      },
      paidFor: {
        createMany: {
          data: expenseFormValues.paidFor.map((paidFor) => ({
            userId: paidFor.participant,
            shares: paidFor.shares,
          })),
        },
      },
      isReimbursement: expenseFormValues.isReimbursement,
      documents: {
        createMany: {
          data: expenseFormValues.documents.map((doc) => ({
            id: randomId(),
            url: doc.url,
            width: doc.width,
            height: doc.height,
          })),
        },
      },
      notes: expenseFormValues.notes,
    },
  })
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  userId?: string,
) {
  const existingExpense = await getExpense(groupId, expenseId)

  const changes: FieldChange[] = [
    {
      field: 'title',
      oldValue: existingExpense?.title ?? null,
      newValue: null,
    },
    {
      field: 'amount',
      oldValue:
        existingExpense?.amount != null ? String(existingExpense.amount) : null,
      newValue: null,
    },
  ]

  await logActivity(groupId, ActivityType.DELETE_EXPENSE, {
    userId,
    expenseId,
    data: existingExpense?.title,
    changes,
  })

  await prisma.expense.delete({
    where: { id: expenseId },
    include: { paidFor: true, paidBy: true },
  })
}

/** Returns the set of User IDs that appear in any expense for the group (as payer or payee) */
export async function getGroupExpenseUserIds(groupId: string) {
  const expenses = await getGroupExpenses(groupId)
  return Array.from(
    new Set(
      expenses.flatMap((e) => [
        e.paidBy.id,
        ...e.paidFor.map((pf) => pf.user.id),
      ]),
    ),
  )
}

export async function getGroups(groupIds: string[]) {
  return (
    await prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: { _count: { select: { memberships: true } } },
    })
  ).map((group) => ({
    ...group,
    _count: { participants: group._count.memberships },
    createdAt: group.createdAt.toISOString(),
  }))
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  expenseFormValues: ExpenseFormValues,
  userId?: string,
) {
  const group = await getGroup(groupId)
  if (!group)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Group not found: ${groupId}`,
    })

  const existingExpense = await getExpense(groupId, expenseId)
  if (!existingExpense)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Expense not found: ${expenseId}`,
    })

  const memberIds = new Set(group.participants.map((p) => p.id))

  if (!memberIds.has(expenseFormValues.paidBy)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'paidBy user is not a group member',
    })
  }
  for (const pf of expenseFormValues.paidFor) {
    if (!memberIds.has(pf.participant)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `User ${pf.participant} is not a group member`,
      })
    }
  }

  await logActivity(groupId, ActivityType.UPDATE_EXPENSE, {
    userId,
    expenseId,
    data: expenseFormValues.title,
    changes: computeExpenseChanges(existingExpense, expenseFormValues),
  })

  const isDeleteRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule === RecurrenceRule.NONE &&
    // Delete the existing RecurrenceExpenseLink only if it has not been acted upon yet
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null

  const isUpdateRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== expenseFormValues.recurrenceRule &&
    // Update the exisiting RecurrenceExpenseLink only if it has not been acted upon yet
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null
  const isCreateRecurrenceExpenseLink =
    existingExpense.recurrenceRule === RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE &&
    // Create a new RecurrenceExpenseLink only if one does not already exist for the expense
    existingExpense.recurringExpenseLink === null

  const newRecurringExpenseLink = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  const updatedRecurrenceExpenseLinkNextExpenseDate = calculateNextDate(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    existingExpense.expenseDate,
  )

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      expenseDate: expenseFormValues.expenseDate,
      amount: expenseFormValues.amount,
      originalAmount: expenseFormValues.originalAmount,
      originalCurrency: expenseFormValues.originalCurrency,
      conversionRate: expenseFormValues.conversionRate,
      title: expenseFormValues.title,
      categoryId: expenseFormValues.category,
      paidById: expenseFormValues.paidBy,
      splitMode: expenseFormValues.splitMode,
      recurrenceRule: expenseFormValues.recurrenceRule,
      paidFor: {
        create: expenseFormValues.paidFor
          .filter(
            (p) =>
              !existingExpense.paidFor.some(
                (pp) => pp.userId === p.participant,
              ),
          )
          .map((paidFor) => ({
            userId: paidFor.participant,
            shares: paidFor.shares,
          })),
        update: expenseFormValues.paidFor.map((paidFor) => ({
          where: {
            expenseId_userId: {
              expenseId,
              userId: paidFor.participant,
            },
          },
          data: {
            shares: paidFor.shares,
          },
        })),
        deleteMany: existingExpense.paidFor
          .filter(
            (paidFor) =>
              !expenseFormValues.paidFor.some(
                (pf) => pf.participant === paidFor.userId,
              ),
          )
          .map((pf) => ({ expenseId: pf.expenseId, userId: pf.userId })),
      },
      recurringExpenseLink: {
        ...(isCreateRecurrenceExpenseLink
          ? {
              create: newRecurringExpenseLink,
            }
          : {}),
        ...(isUpdateRecurrenceExpenseLink
          ? {
              update: {
                nextExpenseDate: updatedRecurrenceExpenseLinkNextExpenseDate,
              },
            }
          : {}),
        delete: isDeleteRecurrenceExpenseLink,
      },
      isReimbursement: expenseFormValues.isReimbursement,
      documents: {
        connectOrCreate: expenseFormValues.documents.map((doc) => ({
          create: doc,
          where: { id: doc.id },
        })),
        deleteMany: existingExpense.documents
          .filter(
            (existingDoc) =>
              !expenseFormValues.documents.some(
                (doc) => doc.id === existingDoc.id,
              ),
          )
          .map((doc) => ({
            id: doc.id,
          })),
      },
      notes: expenseFormValues.notes,
    },
  })
}

export async function updateGroup(
  groupId: string,
  groupFormValues: GroupFormValues,
) {
  const existingGroup = await getGroup(groupId)
  if (!existingGroup) throw new Error('Invalid group ID')

  const isDyad = existingGroup.type === GroupType.DYAD
  const nextValues = isDyad
    ? {
        name: existingGroup.name,
        information: existingGroup.information ?? '',
        currency: groupFormValues.currency,
        currencyCode: groupFormValues.currencyCode,
        simplifyDebts: existingGroup.simplifyDebts,
      }
    : groupFormValues

  const changes = computeGroupChanges(existingGroup, nextValues)

  await logActivity(groupId, ActivityType.UPDATE_GROUP, {
    changes,
  })

  // Regenerate slug if name changed
  const nameChanged = nextValues.name !== existingGroup.name
  const slug = nameChanged
    ? await generateUniqueGroupSlug(nextValues.name)
    : undefined

  return prisma.group.update({
    where: { id: groupId },
    data: {
      name: nextValues.name,
      ...(slug && { slug }),
      information: nextValues.information,
      currency: nextValues.currency,
      currencyCode: nextValues.currencyCode,
      simplifyDebts: nextValues.simplifyDebts,
    },
  })
}

export async function getGroup(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  if (!group) return null

  // Map memberships to a participants-compatible shape for backward compatibility
  return {
    ...group,
    participants: group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
    })),
  }
}

export async function getGroupBySlug(slug: string) {
  const group = await prisma.group.findUnique({
    where: { slug },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  if (!group) return null

  return {
    ...group,
    participants: group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
    })),
  }
}

export async function getCategories() {
  return prisma.category.findMany()
}

export async function getGroupExpenses(
  groupId: string,
  options?: { offset?: number; length?: number; filter?: string },
) {
  await createRecurringExpenses()

  return prisma.expense.findMany({
    select: {
      amount: true,
      category: true,
      createdAt: true,
      expenseDate: true,
      id: true,
      isReimbursement: true,
      paidBy: { select: { id: true, name: true } },
      paidFor: {
        select: {
          user: { select: { id: true, name: true } },
          shares: true,
        },
      },
      splitMode: true,
      recurrenceRule: true,
      title: true,
      notes: true,
      _count: { select: { documents: true } },
    },
    where: {
      groupId,
      title: options?.filter
        ? { contains: options.filter, mode: 'insensitive' }
        : undefined,
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    skip: options && options.offset,
    take: options && options.length,
  })
}

export async function getGroupExpenseCount(groupId: string) {
  return prisma.expense.count({ where: { groupId } })
}

export async function getExpense(groupId: string, expenseId: string) {
  return prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      paidBy: { select: { id: true, name: true, email: true } },
      paidFor: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      category: true,
      documents: true,
      recurringExpenseLink: true,
    },
  })
}

export async function getActivities(
  groupId: string,
  options?: { offset?: number; length?: number },
) {
  const activities = await prisma.activity.findMany({
    where: { groupId },
    include: { changes: true },
    orderBy: [{ time: 'desc' }, { id: 'desc' }],
    skip: options?.offset,
    take: options?.length,
  })

  const expenseIds = activities
    .map((activity) => activity.expenseId)
    .filter(Boolean)
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      id: { in: expenseIds },
    },
  })

  return activities.map((activity) => ({
    ...activity,
    expense:
      activity.expenseId !== null
        ? expenses.find((expense) => expense.id === activity.expenseId)
        : undefined,
  }))
}

export async function getGlobalActivities(
  userId: string,
  options?: { offset?: number; length?: number },
) {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
  })
  const groupIds = memberships.map((membership) => membership.groupId)

  if (groupIds.length === 0) {
    return []
  }

  const activities = await prisma.activity.findMany({
    where: { groupId: { in: groupIds } },
    include: { changes: true },
    orderBy: [{ time: 'desc' }, { id: 'desc' }],
    skip: options?.offset,
    take: options?.length,
  })

  const expenseIds = activities
    .map((activity) => activity.expenseId)
    .filter(Boolean) as string[]

  const activityGroupIds = Array.from(
    new Set(activities.map((activity) => activity.groupId)),
  )

  const [expenses, groups] = await Promise.all([
    prisma.expense.findMany({
      where: { id: { in: expenseIds } },
    }),
    prisma.group.findMany({
      where: { id: { in: activityGroupIds } },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
  ])

  const groupMap = new Map(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        name: group.name,
        slug: group.slug,
        currency: group.currency,
        currencyCode: group.currencyCode,
        participants: group.memberships.map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
        })),
      },
    ]),
  )

  return activities.map((activity) => ({
    ...activity,
    expense:
      activity.expenseId !== null
        ? expenses.find((expense) => expense.id === activity.expenseId)
        : undefined,
    group: groupMap.get(activity.groupId)!,
  }))
}

export async function logActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: {
    /** User ID of the actor performing the activity */
    userId?: string
    expenseId?: string
    data?: string
    changes?: FieldChange[]
  },
) {
  const { changes, userId, ...activityExtra } = extra ?? {}

  const activity = await prisma.activity.create({
    data: {
      id: randomId(),
      groupId,
      time: new Date(),
      activityType,
      // Activity.participantId column stores the User ID of the actor
      participantId: userId,
      ...activityExtra,
      ...(changes && changes.length > 0
        ? {
            changes: {
              createMany: {
                data: changes.map((change) => ({
                  field: change.field,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                })),
              },
            },
          }
        : {}),
    },
    include: { changes: true },
  })

  return activity
}

async function createRecurringExpenses() {
  const localDate = new Date() // Current local date
  const utcDateFromLocal = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      // More precision beyond date is required to ensure that recurring Expenses are created within <most precises unit> of when expected
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
    ),
  )

  const recurringExpenseLinksWithExpensesToCreate =
    await prisma.recurringExpenseLink.findMany({
      where: {
        nextExpenseCreatedAt: null,
        nextExpenseDate: {
          lte: utcDateFromLocal,
        },
      },
      include: {
        currentFrameExpense: {
          include: {
            paidBy: true,
            paidFor: true,
            category: true,
            documents: true,
          },
        },
      },
    })

  for (const recurringExpenseLink of recurringExpenseLinksWithExpensesToCreate) {
    let newExpenseDate = recurringExpenseLink.nextExpenseDate

    let currentExpenseRecord = recurringExpenseLink.currentFrameExpense
    let currentReccuringExpenseLinkId = recurringExpenseLink.id

    while (newExpenseDate < utcDateFromLocal) {
      const newExpenseId = randomId()
      const newRecurringExpenseLinkId = randomId()

      const newRecurringExpenseNextExpenseDate = calculateNextDate(
        currentExpenseRecord.recurrenceRule as RecurrenceRule,
        newExpenseDate,
      )

      const {
        category,
        paidBy,
        paidFor,
        documents,
        ...destructeredCurrentExpenseRecord
      } = currentExpenseRecord

      // Use a transacton to ensure that the only one expense is created for the RecurringExpenseLink
      // just in case two clients are processing the same RecurringExpenseLink at the same time
      const newExpense = await prisma
        .$transaction(async (transaction) => {
          const newExpense = await transaction.expense.create({
            data: {
              ...destructeredCurrentExpenseRecord,
              categoryId: currentExpenseRecord.categoryId,
              paidById: currentExpenseRecord.paidById,
              paidFor: {
                createMany: {
                  data: currentExpenseRecord.paidFor.map((paidFor) => ({
                    userId: paidFor.userId,
                    shares: paidFor.shares,
                  })),
                },
              },
              documents: {
                connect: currentExpenseRecord.documents.map(
                  (documentRecord) => ({
                    id: documentRecord.id,
                  }),
                ),
              },
              id: newExpenseId,
              expenseDate: newExpenseDate,
              recurringExpenseLink: {
                create: {
                  groupId: currentExpenseRecord.groupId,
                  id: newRecurringExpenseLinkId,
                  nextExpenseDate: newRecurringExpenseNextExpenseDate,
                },
              },
            },
            // Ensure that the same information is available on the returned record that was created
            include: {
              paidFor: true,
              documents: true,
              category: true,
              paidBy: true,
            },
          })

          // Mark the RecurringExpenseLink as being "completed" since the new Expense was created
          // if an expense hasn't been created for this RecurringExpenseLink yet
          await transaction.recurringExpenseLink.update({
            where: {
              id: currentReccuringExpenseLinkId,
              nextExpenseCreatedAt: null,
            },
            data: {
              nextExpenseCreatedAt: newExpense.createdAt,
            },
          })

          return newExpense
        })
        .catch(() => {
          console.error(
            'Failed to created recurringExpense for expenseId: %s',
            currentExpenseRecord.id,
          )
          return null
        })

      // If the new expense failed to be created, break out of the while-loop
      if (newExpense === null) break

      // Set the values for the next iteration of the for-loop in case multiple recurring Expenses need to be created
      currentExpenseRecord = newExpense
      currentReccuringExpenseLinkId = newRecurringExpenseLinkId
      newExpenseDate = newRecurringExpenseNextExpenseDate
    }
  }
}

function createPayloadForNewRecurringExpenseLink(
  recurrenceRule: RecurrenceRule,
  priorDateToNextRecurrence: Date,
  groupId: String,
): RecurringExpenseLink {
  const nextExpenseDate = calculateNextDate(
    recurrenceRule,
    priorDateToNextRecurrence,
  )

  const recurringExpenseLinkId = randomId()
  const recurringExpenseLinkPayload = {
    id: recurringExpenseLinkId,
    groupId: groupId,
    nextExpenseDate: nextExpenseDate,
  }

  return recurringExpenseLinkPayload as RecurringExpenseLink
}

// TODO: Modify this function to use a more comprehensive recurrence Rule library like rrule (https://github.com/jkbrzt/rrule)
//
// Current limitations:
// - If a date is intended to be repeated monthly on the 29th, 30th or 31st, it will change to repeating on the smallest
// date that the reccurence has encountered. Ex. If a recurrence is created for Jan 31st on 2025, the recurring expense
// will be created for Feb 28th, March 28, etc. until it is cancelled or fixed
function calculateNextDate(
  recurrenceRule: RecurrenceRule,
  priorDateToNextRecurrence: Date,
): Date {
  const nextDate = new Date(priorDateToNextRecurrence)
  switch (recurrenceRule) {
    case RecurrenceRule.DAILY:
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      break
    case RecurrenceRule.WEEKLY:
      nextDate.setUTCDate(nextDate.getUTCDate() + 7)
      break
    case RecurrenceRule.MONTHLY:
      const nextYear = nextDate.getUTCFullYear()
      const nextMonth = nextDate.getUTCMonth() + 1
      let nextDay = nextDate.getUTCDate()

      // Reduce the next day until it is within the direct next month
      while (!isDateInNextMonth(nextYear, nextMonth, nextDay)) {
        nextDay -= 1
      }
      nextDate.setUTCMonth(nextMonth, nextDay)
      break
  }

  return nextDate
}

function isDateInNextMonth(
  utcYear: number,
  utcMonth: number,
  utcDate: number,
): Boolean {
  const testDate = new Date(Date.UTC(utcYear, utcMonth, utcDate))

  // We're not concerned if the year or month changes. We only want to make sure that the date is our target date
  if (testDate.getUTCDate() !== utcDate) {
    return false
  }

  return true
}
