'use client'
import { ActiveUserBalance } from '@/app/groups/[groupId]/expenses/active-user-balance'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import { ExpenseNotes } from '@/app/groups/[groupId]/expenses/expense-notes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getGroupExpenses } from '@/lib/api'
import { Currency } from '@/lib/currency'
import type { CopyableExpense } from '@/lib/expense-copy'
import { buildCopyExpensePrefill } from '@/lib/expense-copy'
import { getGroupExpenseDetailPath } from '@/lib/expense-detail-urls'
import { openCopyGroupExpense } from '@/lib/expense-dialog-events'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { isConsolidatedPayment } from '@/lib/payments'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ChevronRight, Copy, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Fragment, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

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
  const t = useTranslations('ExpenseDetail')
  const { group } = useCurrentGroup()
  const utils = trpc.useUtils()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isLocked = isConsolidatedPayment(expense)

  const { mutate: deleteExpense, isPending: isDeleting } =
    trpc.groups.expenses.delete.useMutation({
      onSuccess: () => {
        utils.groups.expenses.invalidate()
        utils.groups.balances.invalidate()
        invalidateActivityQueries(utils)
        setDeleteOpen(false)
      },
    })

  const handleCopy = () => {
    const copyableExpense: CopyableExpense = {
      title: expense.title,
      amount: expense.amount,
      categoryId: expense.categoryId,
      paidById: expense.paidBy.id,
      splitMode: expense.splitMode,
      isReimbursement: expense.isReimbursement,
      notes: expense.notes,
      paidFor: expense.paidFor.map((pf) => ({
        userId: pf.user.id,
        shares: pf.shares,
      })),
    }
    const prefill = buildCopyExpensePrefill(copyableExpense, currency)
    openCopyGroupExpense(groupId, group?.name ?? '', prefill)
  }

  return (
    <div
      key={expense.id}
      className={cn(
        'flex justify-between px-6 py-4 text-sm cursor-pointer hover:bg-accent gap-1 items-stretch',
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
      <div className="flex-1 min-w-0">
        <div className={cn('mb-1', expense.isReimbursement && 'italic')}>
          {expense.title}
        </div>
        <div className="text-xs text-muted-foreground">
          <Participants expense={expense} participantCount={participantCount} />
        </div>
        <div className="text-xs text-muted-foreground">
          <ActiveUserBalance currency={currency} expense={expense} />
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <div className="flex items-start gap-0.5">
          <div
            className={cn(
              'tabular-nums whitespace-nowrap pt-0.5',
              expense.isReimbursement ? 'italic' : 'font-bold',
            )}
          >
            {formatCurrency(currency, expense.amount, locale)}
          </div>
          {!isLocked ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-mt-1 -mr-1"
                    aria-label={`${t('copy')}, ${t('delete')}`}
                  />
                }
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                  <span>{t('copy')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('delete')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mt-1 -mr-1 hidden sm:inline-flex"
              onClick={(event) => {
                event.stopPropagation()
                router.push(getGroupExpenseDetailPath(groupId, expense.id))
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <DocumentsCount count={expense._count.documents} />
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(expense.expenseDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {expense.isReimbursement
                ? t('deletePaymentConfirm')
                : t('deleteConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteExpense({ groupId, expenseId: expense.id })}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  {t('deleting')}
                </>
              ) : (
                t('delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
