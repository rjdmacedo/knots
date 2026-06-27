'use client'
import { ActiveUserBalance } from '@/app/groups/[groupId]/expenses/active-user-balance'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import { ExpenseNotes } from '@/app/groups/[groupId]/expenses/expense-notes'
import { Button } from '@/components/ui/button'
import { getGroupExpenses } from '@/lib/api'
import { Currency } from '@/lib/currency'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Fragment } from 'react'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

function Participants({
  expense,
  participantCount,
}: {
  expense: Expense
  participantCount: number
}) {
  const t = useTranslations('ExpenseCard')
  const key = expense.amount > 0 ? 'paidBy' : 'receivedBy'
  const paidFor =
    expense.paidFor.length == participantCount && participantCount >= 4 ? (
      <strong>{t('everyone')}</strong>
    ) : (
      expense.paidFor.map((paidFor, index) => (
        <Fragment key={index}>
          {index !== 0 && <>, </>}
          <strong>{paidFor.user.name}</strong>
        </Fragment>
      ))
    )

  const participants = t.rich(key, {
    strong: (chunks) => <strong>{chunks}</strong>,
    paidBy: expense.paidBy.name,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

type Props = {
  expense: Expense
  currency: Currency
  groupId: string
  participantCount: number
}

export function ExpenseCard({
  expense,
  currency,
  groupId,
  participantCount,
}: Props) {
  const locale = useLocale()
  const router = useRouter()

  return (
    <div
      key={expense.id}
      className={cn(
        'flex justify-between sm:mx-6 px-4 sm:rounded-lg sm:pr-2 sm:pl-4 py-4 text-sm cursor-pointer hover:bg-accent gap-1 items-stretch',
        expense.isReimbursement && 'italic',
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (
          target.closest(
            'button, a, [role="dialog"], [data-slot="drawer-overlay"], [data-slot="popover-content"]',
          )
        ) {
          return
        }
        router.push(getGroupExpenseDetailPath(groupId, expense.id))
      }}
    >
      <div className="flex flex-col items-center mr-2 gap-1">
        <CategoryIcon
          category={expense.category}
          className="w-4 h-4 mt-0.5 text-muted-foreground"
        />
        <ExpenseNotes notes={expense.notes} title={expense.title} />
      </div>
      <div className="flex-1">
        <div className={cn('mb-1', expense.isReimbursement && 'italic')}>
          {expense.title}
        </div>
        <div className="text-xs text-muted-foreground">
          <Participants expense={expense} participantCount={participantCount} />
        </div>
        <div className="text-xs text-muted-foreground">
          <ActiveUserBalance {...{ groupId, currency, expense }} />
        </div>
      </div>
      <div className="flex flex-col justify-between items-end">
        <div
          className={cn(
            'tabular-nums whitespace-nowrap',
            expense.isReimbursement ? 'italic' : 'font-bold',
          )}
        >
          {formatCurrency(currency, expense.amount, locale)}
        </div>
        <div className="text-xs text-muted-foreground">
          <DocumentsCount count={expense._count.documents} />
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(expense.expenseDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>
      <Button
        type="button"
        variant="link"
        size="icon"
        className="self-center hidden sm:flex"
        onClick={(event) => {
          event.stopPropagation()
          router.push(getGroupExpenseDetailPath(groupId, expense.id))
        }}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  )
}
