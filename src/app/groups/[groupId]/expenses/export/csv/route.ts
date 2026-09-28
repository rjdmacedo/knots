import { generateGroupExpensesCsv } from '@/lib/csv-export'
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
          expenseDate: true,
          title: true,
          category: { select: { name: true } },
          amount: true,
          originalAmount: true,
          originalCurrency: true,
          conversionRate: true,
          paidById: true,
          paidBy: { select: { id: true, name: true } },
          paidFor: {
            select: {
              userId: true,
              shares: true,
              user: { select: { id: true, name: true } },
            },
          },
          payers: {
            select: {
              userId: true,
              amount: true,
              user: { select: { id: true, name: true } },
            },
          },
          isReimbursement: true,
          splitMode: true,
        },
        orderBy: [{ expenseDate: 'asc' }, { createdAt: 'asc' }],
      },
      memberships: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  if (!group) {
    return NextResponse.json({ error: 'Invalid group ID' }, { status: 404 })
  }

  // Map memberships to participants shape
  const participants = group.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
  }))

  const csv = generateGroupExpensesCsv(group, participants, group.expenses)

  const date = new Date().toISOString().split('T')[0]
  const filename = `Knots Export - ${group.name} - ${date}.csv`

  // \uFEFF character is added at the beginning of the CSV content to ensure that it is interpreted
  // as UTF-8 with BOM (Byte Order Mark), which helps applications like Excel correctly interpret encoding.
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': contentDisposition(filename),
    },
  })
}
