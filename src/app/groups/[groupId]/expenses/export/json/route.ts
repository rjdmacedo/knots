import { prisma } from '@/lib/prisma'
import contentDisposition from 'content-disposition'
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
          paidFor: { select: { userId: true, shares: true } },
          isReimbursement: true,
          splitMode: true,
          recurrenceRule: true,
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
  const exportData = {
    ...group,
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
