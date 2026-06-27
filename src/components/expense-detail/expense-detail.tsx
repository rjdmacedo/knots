'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrency, type Currency } from '@/lib/currency'
import {
  buildExpenseSplitLines,
  formatSplitAmount,
  getPaymentDisplayVariant,
  getPaymentParties,
  getSplitLineMessageKey,
} from '@/lib/expense-detail-splits'
import type { TrendMonth } from '@/lib/expense-detail-trends'
import {
  openEditDirectExpense,
  openEditGroupExpense,
} from '@/lib/expense-dialog-events'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { isConsolidatedPayment } from '@/lib/payments'
import { formatCurrency, formatDate, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import type { Category, SplitMode } from '@prisma/client'
import { Camera, Loader2, Pencil, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, useRouter } from 'next/navigation'
import { useSpinDelay } from 'spin-delay'
import { ExpenseDetailCategoryPicker } from './expense-detail-category-picker'
import { ExpenseDetailReceiptUpload } from './expense-detail-receipt-upload'
import { ExpenseDetailTrends } from './expense-detail-trends'
import { ParticipantAvatar } from './participant-avatar'

type GroupProps = {
  scope: 'group'
  groupId: string
  expenseId: string
}

type DirectProps = {
  scope: 'direct'
  username: string
  expenseId: string
}

type FriendPaymentProps = {
  scope: 'friend-payment'
  username: string
  expenseId: string
}

type DetailNavigationOptions = {
  backHref?: string
  backLabel?: string
  deleteRedirectHref?: string
  invalidateFriendQueries?: boolean
}

export type ExpenseDetailProps = GroupProps | DirectProps | FriendPaymentProps

export function ExpenseDetail(props: ExpenseDetailProps) {
  if (props.scope === 'group') {
    return (
      <GroupExpenseDetailLoader
        groupId={props.groupId}
        expenseId={props.expenseId}
      />
    )
  }

  if (props.scope === 'friend-payment') {
    return (
      <FriendPaymentDetailLoader
        username={props.username}
        expenseId={props.expenseId}
      />
    )
  }

  return (
    <DirectExpenseDetailLoader
      username={props.username}
      expenseId={props.expenseId}
    />
  )
}

function FriendPaymentDetailLoader({
  username,
  expenseId,
}: {
  username: string
  expenseId: string
}) {
  const t = useTranslations('ExpenseDetail')

  const {
    data: payment,
    isLoading,
    isError,
  } = trpc.friends.getPaymentDetail.useQuery({
    expenseId,
    friendUsername: username,
  })

  const showLoading = useSpinDelay(isLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (showLoading) {
    return <ExpenseDetailSkeleton />
  }

  if (isError || !payment) {
    notFound()
  }

  const navigation: DetailNavigationOptions = {
    backHref: `/friends/${username}/expenses`,
    backLabel: t('backToFriend', { name: payment.friendName }),
    deleteRedirectHref: `/friends/${username}/expenses`,
    invalidateFriendQueries: true,
  }

  if (payment.groupId) {
    return (
      <GroupExpenseDetailLoader
        groupId={payment.groupId}
        expenseId={expenseId}
        navigation={navigation}
      />
    )
  }

  return (
    <DirectExpenseDetailLoader
      username={username}
      expenseId={expenseId}
      navigation={navigation}
    />
  )
}

function GroupExpenseDetailLoader({
  groupId,
  expenseId,
  navigation,
}: {
  groupId: string
  expenseId: string
  navigation?: DetailNavigationOptions
}) {
  const t = useTranslations('ExpenseDetail')
  const locale = useLocale()
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: groupData, isLoading: groupLoading } = trpc.groups.get.useQuery(
    {
      groupId,
    },
  )
  const { data: expenseData, isLoading: expenseLoading } =
    trpc.groups.expenses.get.useQuery({ groupId, expenseId })
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const { data: profile } = trpc.profile.getProfile.useQuery()

  const { mutate: deleteExpense, isPending: isDeleting } =
    trpc.groups.expenses.delete.useMutation({
      onSuccess: () => {
        utils.groups.expenses.invalidate()
        utils.groups.balances.invalidate()
        invalidateActivityQueries(utils)
        if (navigation?.invalidateFriendQueries) {
          utils.friends.getTimeline.invalidate()
          utils.friends.getDirectExpenses.invalidate()
          utils.friends.getBalanceDetail.invalidate()
          utils.friends.listWithBalances.invalidate()
        }
        router.push(
          navigation?.deleteRedirectHref ??
            navigation?.backHref ??
            `/groups/${groupId}/expenses`,
        )
      },
    })

  const isLoading = useSpinDelay(groupLoading || expenseLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (isLoading) {
    return <ExpenseDetailSkeleton />
  }

  const group = groupData?.group
  const expense = expenseData?.expense

  if (!group || !expense) {
    notFound()
  }

  const currency = getCurrencyFromGroup(group)
  const isLocked = isConsolidatedPayment(expense)

  return (
    <ExpenseDetailContent
      expense={expense}
      currency={currency}
      categories={categoriesData?.categories ?? []}
      profileId={profile?.id}
      trends={expenseData.trends ?? []}
      categoryName={expenseData.categoryName ?? t('generalCategory')}
      backHref={navigation?.backHref ?? `/groups/${groupId}/expenses`}
      backLabel={navigation?.backLabel ?? t('backToExpenses')}
      contextBadge={group.name}
      trendsContextName={group.name}
      statsHref={`/groups/${groupId}/stats`}
      categoryPickerGroupId={groupId}
      receiptUpload={{ variant: 'group', groupId, expenseId }}
      canEdit={!isLocked}
      canDelete={!isLocked}
      isDeleting={isDeleting}
      onEdit={() => openEditGroupExpense(groupId, expenseId)}
      onDelete={() => deleteExpense({ groupId, expenseId })}
      addedBy={expenseData.addedBy}
      addedAt={expenseData.addedAt}
      lastUpdatedBy={expenseData.lastUpdatedBy}
      lastUpdatedAt={expenseData.lastUpdatedAt}
      isLocked={isLocked}
    />
  )
}

function DirectExpenseDetailLoader({
  username,
  expenseId,
  navigation,
}: {
  username: string
  expenseId: string
  navigation?: DetailNavigationOptions
}) {
  const t = useTranslations('ExpenseDetail')
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.friends.getDirectExpense.useQuery({
    expenseId,
  })
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const { data: profile } = trpc.profile.getProfile.useQuery()

  const invalidateFriendQueries = () => {
    utils.friends.getTimeline.invalidate()
    utils.friends.getDirectExpenses.invalidate()
    utils.friends.getBalanceDetail.invalidate()
    utils.friends.listWithBalances.invalidate()
  }

  const { mutate: deleteDirectExpense, isPending: isDeletingDirect } =
    trpc.friends.deleteDirectExpense.useMutation({
      onSuccess: () => {
        invalidateFriendQueries()
        router.push(
          navigation?.deleteRedirectHref ??
            navigation?.backHref ??
            `/friends/${username}`,
        )
      },
    })

  const { mutate: deletePayment, isPending: isDeletingPayment } =
    trpc.friends.deletePayment.useMutation({
      onSuccess: () => {
        invalidateFriendQueries()
        router.push(
          navigation?.deleteRedirectHref ??
            navigation?.backHref ??
            `/friends/${username}`,
        )
      },
    })

  const showLoading = useSpinDelay(isLoading, {
    delay: 200,
    minDuration: 300,
  })

  if (showLoading) {
    return <ExpenseDetailSkeleton />
  }

  const expense = data?.expense
  const friend = data?.friend
  const expenseCurrency = data?.currency

  if (!expense || !friend || !expenseCurrency) {
    notFound()
  }

  const currency = getCurrency(expenseCurrency)
  const isLocked = isConsolidatedPayment(expense)
  const isDeleting = isDeletingDirect || isDeletingPayment

  return (
    <ExpenseDetailContent
      expense={expense}
      currency={currency}
      categories={categoriesData?.categories ?? []}
      profileId={profile?.id}
      trends={data.trends ?? []}
      categoryName={data.categoryName ?? t('generalCategory')}
      backHref={navigation?.backHref ?? `/friends/${username}`}
      backLabel={
        navigation?.backLabel ?? t('backToFriend', { name: friend.name })
      }
      contextBadge={friend.name}
      trendsContextName={friend.name}
      statsHref={`/friends/${username}/stats`}
      receiptUpload={{ variant: 'direct', expenseId }}
      canEdit={!isLocked}
      canDelete={!isLocked}
      isDeleting={isDeleting}
      onEdit={() => openEditDirectExpense(expenseId)}
      onDelete={() =>
        expense.isReimbursement
          ? deletePayment({ expenseId })
          : deleteDirectExpense({ expenseId })
      }
      addedBy={data.addedBy}
      addedAt={data.addedAt}
      isLocked={isLocked}
    />
  )
}

type ExpenseDetailContentProps = {
  expense: {
    id: string
    title: string
    amount: number
    expenseDate: Date
    createdAt: Date
    isReimbursement: boolean
    notes: string | null
    category: Category | null
    paidBy: { id: string; name: string | null; email?: string | null }
    paidFor: Array<{
      userId: string
      shares: number
      user: { id: string; name: string | null; email?: string | null }
    }>
    splitMode: SplitMode
    documents: Array<{ id: string; url: string; width: number; height: number }>
    creationMethod?: string | null
    bundleId?: string | null
  }
  currency: Currency
  categories: Category[]
  profileId?: string
  trends: TrendMonth[]
  categoryName: string
  backHref: string
  backLabel: string
  contextBadge: string
  trendsContextName: string
  statsHref: string
  categoryPickerGroupId?: string
  receiptUpload:
    | { variant: 'group'; groupId: string; expenseId: string }
    | { variant: 'direct'; expenseId: string }
  canEdit: boolean
  canDelete: boolean
  isDeleting: boolean
  onEdit: () => void
  onDelete: () => void
  addedBy?: { id: string; name: string } | null
  addedAt?: Date
  lastUpdatedBy?: { id: string; name: string } | null
  lastUpdatedAt?: Date | null
  isLocked: boolean
}

function ExpenseDetailContent({
  expense,
  currency,
  categories,
  profileId,
  trends,
  categoryName,
  backHref,
  backLabel,
  contextBadge,
  trendsContextName,
  statsHref,
  categoryPickerGroupId,
  receiptUpload,
  canEdit,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
  addedBy,
  addedAt,
  lastUpdatedBy,
  lastUpdatedAt,
  isLocked,
}: ExpenseDetailContentProps) {
  const t = useTranslations('ExpenseDetail')
  const locale = useLocale()
  const documentsEnabled =
    process.env.NEXT_PUBLIC_ENABLE_EXPENSE_DOCUMENTS === 'true'

  const formattedAmount = formatCurrency(currency, expense.amount, locale)
  const addedOnDate = formatDate(addedAt ?? expense.createdAt, locale, {
    dateStyle: 'long',
  })
  const addedByLabel =
    addedBy && profileId === addedBy.id
      ? t('addedByYou', { date: addedOnDate })
      : t('addedBy', {
          name: addedBy?.name ?? t('someone'),
          date: addedOnDate,
        })
  const lastUpdatedLabel =
    lastUpdatedBy && lastUpdatedAt
      ? profileId === lastUpdatedBy.id
        ? t('lastUpdatedByYou', {
            date: formatDate(lastUpdatedAt, locale, { dateStyle: 'long' }),
          })
        : t('lastUpdatedBy', {
            name: lastUpdatedBy.name,
            date: formatDate(lastUpdatedAt, locale, { dateStyle: 'long' }),
          })
      : null
  const splitLines = buildExpenseSplitLines(expense, profileId)
  const paymentParties = getPaymentParties(expense)

  const paymentSummary =
    expense.isReimbursement && paymentParties
      ? (() => {
          const variant = getPaymentDisplayVariant(paymentParties, profileId)
          const amount = formatSplitAmount(currency, expense.amount, locale)

          switch (variant) {
            case 'paidYou':
              return t('paidYou', {
                name: paymentParties.payerName || t('someone'),
                amount,
              })
            case 'youPaid':
              return t('youPaidRecipient', {
                name: paymentParties.payeeName || t('someone'),
                amount,
              })
            case 'payerPaidPayee':
              return t('payerPaidPayee', {
                payer: paymentParties.payerName || t('someone'),
                payee: paymentParties.payeeName || t('someone'),
                amount,
              })
          }
        })()
      : null

  const title =
    paymentSummary ||
    expense.title.trim() ||
    (expense.isReimbursement ? t('payment') : t('expense'))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {backLabel}
        </Link>
        <div className="flex items-center gap-1">
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('delete')}
                  >
                    <Trash2 />
                  </Button>
                }
              />
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
                    onClick={onDelete}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                        {t('deleting')}
                      </>
                    ) : (
                      t('delete')
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('edit')}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex gap-4 pt-6">
          {expense.isReimbursement ? (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted">
              <CategoryIcon
                category={expense.category}
                className="size-7 text-muted-foreground"
              />
            </div>
          ) : (
            <ExpenseDetailCategoryPicker
              groupId={categoryPickerGroupId}
              expenseId={receiptUpload.expenseId}
              category={expense.category}
              categories={categories}
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className={cnTitle(expense.isReimbursement)}>{title}</h1>
                {!expense.isReimbursement ? (
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {formattedAmount}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{contextBadge}</Badge>
                  {expense.isReimbursement ? (
                    <Badge variant="secondary">{t('payment')}</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {addedByLabel}
                </p>
                {lastUpdatedLabel ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lastUpdatedLabel}
                  </p>
                ) : null}
              </div>

              {documentsEnabled ? (
                <ExpenseDetailReceiptUpload
                  {...receiptUpload}
                  documents={expense.documents}
                />
              ) : expense.documents[0] ? (
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border bg-muted">
                  <Image
                    src={expense.documents[0].url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground">
                  <Camera className="size-6" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!expense.isReimbursement ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center gap-3">
              <ParticipantAvatar name={expense.paidBy.name} size="lg" />
              <p className="text-base">
                {profileId === expense.paidBy.id
                  ? t('youPaidAmount', { amount: formattedAmount })
                  : t('paidAmount', {
                      name: expense.paidBy.name ?? t('someone'),
                      amount: formattedAmount,
                    })}
              </p>
            </div>

            {splitLines.length > 0 ? (
              <>
                <Separator />
                <div className="flex flex-col gap-3 border-s-2 border-muted ps-4">
                  {splitLines.map((line) => {
                    const formattedShare = formatSplitAmount(
                      currency,
                      line.amount,
                      locale,
                    )
                    const messageKey = getSplitLineMessageKey(line)

                    return (
                      <div
                        key={line.userId}
                        className="flex items-center gap-3"
                      >
                        <ParticipantAvatar name={line.name} size="sm" />
                        <p className="text-sm text-muted-foreground">
                          {t(messageKey, {
                            name: line.name,
                            amount: formattedShare,
                          })}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!expense.isReimbursement ? (
        <ExpenseDetailTrends
          contextName={trendsContextName}
          categoryName={categoryName}
          months={trends}
          currency={currency}
          statsHref={statsHref}
        />
      ) : null}

      {expense.notes ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 text-sm font-semibold">{t('notes')}</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {expense.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {expense.isReimbursement ? (
        <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
          {isLocked ? t('consolidationDisclaimer') : t('paymentDisclaimer')}
        </p>
      ) : null}

      {isLocked ? (
        <p className="text-center text-xs text-muted-foreground">
          {t('readOnlyNotice')}
        </p>
      ) : null}
    </div>
  )
}

function cnTitle(isReimbursement: boolean) {
  return isReimbursement
    ? 'truncate text-xl font-semibold italic'
    : 'truncate text-xl font-semibold'
}

function ExpenseDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}
