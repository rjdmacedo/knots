import { prisma } from '@/lib/prisma'
import { create as contentDisposition } from 'content-disposition'
import { NextResponse } from 'next/server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      currency: true,
      currencyCode: true,
      expenses: {
        select: {
          createdAt: true,
          expenseDate: true,
          title: true,
          category: { select: { grouping: true, name: true } },
          amount: true,
          originalAmount: true,
          originalCurrency: true,
          conversionRate: true,
          paidById: true,
          payers: { select: { userId: true, amount: true } },
          paidFor: { select: { userId: true, shares: true } },
          isReimbursement: true,
          splitMode: true,
          recurrenceRule: true,
          linkedExpenseId: true,
          // Itemization detail so an itemized expense can be reconstructed
          // (Requirement 10.2, 13.5). Entry-currency amounts; empty/null when
          // the expense has no items. The remainder ("Other" pool) + marker
          // round-trip alongside the items.
          itemsAuthoritative: true,
          remainderAmount: true,
          remainderAllocationMode: true,
          remainderSplitMode: true,
          remainderShares: { select: { userId: true, shares: true } },
          items: {
            select: {
              title: true,
              amount: true,
              unitPrice: true,
              quantity: true,
              position: true,
              assignments: { select: { userId: true } },
            },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
      },
      memberships: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })
  if (!group)
    return NextResponse.json({ error: 'Invalid group ID' }, { status: 404 })

  // Map to backward-compatible export shape
  const expenses = group.expenses.map((expense) => {
    const paidBy =
      expense.payers.length > 0
        ? expense.payers.map((p) => ({ userId: p.userId, amount: p.amount }))
        : [{ userId: expense.paidById, amount: expense.amount }]

    const { payers, ...rest } = expense
    return {
      ...rest,
      paidById: paidBy[0].userId,
      paidBy,
    }
  })

  const exportData = {
    ...group,
    expenses,
    participants: group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    })),
    memberships: undefined,
  }

  const date = new Date().toISOString().split('T')[0]
  const filename = `Knots Export - ${date}`
  return NextResponse.json(exportData, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': contentDisposition(`${filename}.json`),
    },
  })
}
