'use client'

import {
  ExpenseForm,
  ExpenseFormCreatePrefill,
} from '@/app/groups/[groupId]/expenses/expense-form'
import { PaymentForm } from '@/app/groups/[groupId]/expenses/payment-form'
import { OutsideParticipantControl } from '@/components/expense-editor/outside-participant-control'
import { toast } from '@/components/ui/toast'
import { Locale } from '@/i18n'
import { getCurrency } from '@/lib/currency'
import {
  EditorMode,
  getEditorReturnPath,
} from '@/lib/expense-editor-navigation'
import {
  deriveEditorParticipants,
  isPaymentMode,
} from '@/lib/expense-editor-participants'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { FriendListItem } from '@/lib/friends'
import { useMediaQuery } from '@/lib/hooks'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { isConsolidatedPayment } from '@/lib/payments'
import { ExpenseFormValues } from '@/lib/schemas'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ExternalLink } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

type Group = NonNullable<AppRouterOutput['groups']['get']['group']>

type ExpenseEditorProps = {
  /** Group id from the route. The Editor never asks the user to pick a group. */
  groupId: string
  /** Edit mode: the expense being edited. Omit for create mode. */
  expenseId?: string
  /** Create-mode prefill (copy, receipt, payment). Ignored in edit mode. */
  createPrefill?: ExpenseFormCreatePrefill
  runtimeFeatureFlags?: RuntimeFeatureFlags
}

const defaultRuntimeFeatureFlags: RuntimeFeatureFlags = {
  enableExpenseDocuments: false,
  enableReceiptExtract: false,
  enableCategoryExtract: false,
}

/**
 * Shared page body for the group-expense New_Page and Edit_Page.
 *
 * The group is fixed by the route, so this Editor renders no group selection —
 * only the {@link OutsideParticipantControl} for adding friends outside the
 * group. It selects {@link PaymentForm} vs {@link ExpenseForm} by reimbursement
 * mode, derives the participant list from the URL group plus any added outside
 * friends, and renders no `Dialog` shell: the chosen form supplies its own
 * Save/Delete footer and its `PreventNavigation` guard covers leaving with a
 * dirty form. Locked/consolidated payments short-circuit to the Detail_Page.
 */
export function ExpenseEditor({
  groupId,
  expenseId,
  createPrefill,
  runtimeFeatureFlags = defaultRuntimeFeatureFlags,
}: ExpenseEditorProps) {
  const t = useTranslations('FloatingCreateExpense')
  const tDecomp = useTranslations('ExpenseForm.decompositionBanner')
  const locale = useLocale() as Locale
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const utils = trpc.useUtils()

  const isEditMode = expenseId !== undefined

  // Prefer the group already provided by the /groups/[groupId] layout context;
  // fall back to fetching it directly when the context group is not yet loaded.
  const currentGroup = useCurrentGroup()
  const { data: groupFallback } = trpc.groups.get.useQuery(
    { groupId },
    { enabled: currentGroup.isLoading },
  )
  const group: Group | undefined = currentGroup.isLoading
    ? (groupFallback?.group ?? undefined)
    : currentGroup.group

  const { data: profile } = trpc.profile.getProfile.useQuery()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories ?? []
  const { data: friends = [] } = trpc.friends.list.useQuery()

  // Mutations — the group/hybrid branches of the dialog's save/delete logic.
  const { mutateAsync: createGroupExpense } =
    trpc.groups.expenses.create.useMutation()
  const { mutateAsync: createGlobalExpense } =
    trpc.friends.createGlobalExpense.useMutation()
  const { mutateAsync: updateGroupExpense } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteGroupExpense } =
    trpc.groups.expenses.delete.useMutation()

  // Edit mode: load the expense being edited.
  const { data: expenseData } = trpc.groups.expenses.get.useQuery(
    { groupId, expenseId: expenseId ?? '' },
    { enabled: isEditMode },
  )
  const editingExpense = expenseData?.expense

  // Outside friends added in this Editor session (additive to group members).
  const [selectedFriends, setSelectedFriends] = useState<FriendListItem[]>([])

  // Guard locked/consolidated payments: short-circuit back to the Detail_Page.
  const lockedGuardFired = useRef(false)
  useEffect(() => {
    if (!isEditMode || !editingExpense || lockedGuardFired.current) return
    if (isConsolidatedPayment(editingExpense)) {
      lockedGuardFired.current = true
      toast.error(t('lockedPaymentToast'))
      router.push(
        getEditorReturnPath({ kind: 'edit', groupId, expenseId: expenseId! }),
      )
    }
  }, [isEditMode, editingExpense, groupId, expenseId, router, t])

  const paymentMode = isPaymentMode({
    expenseIsReimbursement: editingExpense?.isReimbursement,
    prefillIsReimbursement: createPrefill?.isReimbursement,
  })

  // Derive the participant list: current user + group members + added outside
  // friends, deduped by resolved id.
  const participants = useMemo(() => {
    if (!profile || !group) return []
    return deriveEditorParticipants({
      currentUser: {
        id: profile.id,
        name: profile.name || t('you'),
        email: profile.email ?? null,
      },
      groupMembers: group.participants,
      addedOutsideFriends: selectedFriends,
    })
  }, [profile, group, selectedFriends, t])

  // The form's group carries the derived participants (URL group + outside
  // friends), matching how the dialog builds its virtual group today. The
  // group participant shape expects a non-null email, so a derived friend with
  // no email is normalized to an empty string (as the dialog effectively did).
  const formGroup = useMemo(() => {
    if (!group) return undefined
    return {
      ...group,
      participants: participants.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email ?? '',
      })),
    }
  }, [group, participants])

  // The mode drives return navigation: new → group expense list; edit →
  // the expense Detail_Page.
  const editorMode: EditorMode = isEditMode
    ? { kind: 'edit', groupId, expenseId: expenseId! }
    : { kind: 'new', groupId }

  // Raise the decomposition toast with the persistent (`timeout: 0`) toast API,
  // adding a "view expense" action unless we are already on that page. The
  // toast is closed after the redirect fires.
  const showDecompositionToast = ({
    groupHalfAmount,
    directHalves,
    expenseDetailUrl,
  }: {
    groupHalfAmount: number
    directHalves: Array<{ name: string; amount: number }>
    expenseDetailUrl: string
  }) => {
    if (!group) return
    const currency = getCurrencyFromGroup(group)
    const lines = [
      tDecomp('postSaveGroupHalfLine', {
        amount: formatCurrency(currency, groupHalfAmount, locale),
      }),
      ...directHalves.map((half) =>
        tDecomp('postSaveNonMemberLine', {
          name: half.name,
          amount: formatCurrency(currency, half.amount, locale),
        }),
      ),
    ]
    const toastId = toast.add({
      title: tDecomp('postSaveTitle'),
      description: lines.join('\n'),
      timeout: 0,
      actionProps: {
        children: <ExternalLink />,
        'aria-label': t('viewGroupExpense'),
        onClick: () => {
          router.push(expenseDetailUrl)
          toast.close(toastId)
        },
      },
    })
  }

  // Invalidate every query the group/hybrid save or delete can affect, matching
  // the dialog's invalidation set.
  const invalidateAfterMutation = () => {
    if (isEditMode) {
      void utils.groups.expenses.get.invalidate({
        groupId,
        expenseId: expenseId!,
      })
    }
    utils.friends.listWithBalances.invalidate()
    utils.friends.getDirectExpenses.invalidate()
    utils.friends.getBalanceDetail.invalidate()
    utils.groupMembership.getUserGroups.invalidate()
    utils.friends.getTimeline.invalidate()
    utils.groups.expenses.invalidate()
    utils.groups.balances.invalidate()
    invalidateActivityQueries(utils)
  }

  const handleSubmit = async (values: ExpenseFormValues) => {
    try {
      if (isEditMode) {
        // Update an existing group expense.
        const updateResult = await updateGroupExpense({
          expenseId: expenseId!,
          groupId,
          expenseFormValues: values,
        })
        if (updateResult.decomposition) {
          showDecompositionToast({
            groupHalfAmount: updateResult.decomposition.groupHalfAmount,
            directHalves: updateResult.decomposition.directHalves.map(
              (half) => ({
                name: half.nonMemberName,
                amount: half.amount,
              }),
            ),
            expenseDetailUrl: `/groups/${groupId}/expenses/${updateResult.expense.id}`,
          })
        } else {
          toast.success(
            t(paymentMode ? 'paymentUpdateSuccessToast' : 'updateSuccessToast'),
          )
        }
      } else if (selectedFriends.length > 0) {
        // Hybrid create: group + friends outside the group.
        const activeCurrency =
          values.originalCurrency || profile?.preferredCurrency || 'EUR'
        const currencyObj = getCurrency(activeCurrency, locale)
        const amountMajor = values.amount / 10 ** currencyObj.decimal_digits

        const globalResult = await createGlobalExpense({
          title: values.title,
          amount: amountMajor,
          currency: activeCurrency,
          paidById: values.paidBy[0].participant,
          expenseDate: values.expenseDate,
          notes: values.notes || undefined,
          groupId,
          friendIds: selectedFriends.map((f) => f.id),
          splitMode: values.splitMode,
          category: values.category,
          recurrenceRule: values.recurrenceRule,
          documents: values.documents.map((d) => ({
            id: d.id,
            url: d.url,
            width: d.width,
            height: d.height,
          })),
          paidFor: values.paidFor.map((pf) => ({
            participant: pf.participant,
            shares: pf.shares,
          })),
        })

        // Decomposition path: result has { groupHalf, directHalves }.
        if ('groupHalf' in globalResult && globalResult.groupHalf) {
          const groupHalf = globalResult.groupHalf
          const nameById = new Map(
            participants.map((participant) => [
              participant.id,
              participant.name,
            ]),
          )
          for (const friend of selectedFriends) {
            nameById.set(friend.friendUserId ?? friend.id, friend.name)
          }
          showDecompositionToast({
            groupHalfAmount: groupHalf.amount,
            directHalves: (globalResult.directHalves ?? []).map((half) => ({
              name: nameById.get(half.nonMemberId) ?? half.nonMemberId,
              amount: half.amount,
            })),
            expenseDetailUrl: `/groups/${groupHalf.groupId}/expenses/${groupHalf.id}`,
          })
        } else {
          toast.success(
            values.isReimbursement
              ? t('paymentSuccessToast')
              : t('successToast'),
          )
        }
      } else {
        // Plain group expense create.
        const createResult = await createGroupExpense({
          groupId,
          expenseFormValues: values,
        })
        if (createResult.decomposition) {
          showDecompositionToast({
            groupHalfAmount: createResult.decomposition.groupHalfAmount,
            directHalves: createResult.decomposition.directHalves.map(
              (half) => ({
                name: half.nonMemberName,
                amount: half.amount,
              }),
            ),
            expenseDetailUrl: `/groups/${groupId}/expenses/${createResult.expense.id}`,
          })
        } else {
          toast.success(
            values.isReimbursement
              ? t('paymentSuccessToast')
              : t('successToast'),
          )
        }
      }

      invalidateAfterMutation()
      router.push(getEditorReturnPath(editorMode))
    } catch (err) {
      console.error(err)
      toast.error(
        t(
          isEditMode
            ? paymentMode
              ? 'paymentUpdateErrorToast'
              : 'updateErrorToast'
            : paymentMode
              ? 'paymentErrorToast'
              : 'errorToast',
        ),
      )
    }
  }

  const handleDelete = async () => {
    if (!isEditMode) return
    try {
      await deleteGroupExpense({ expenseId: expenseId!, groupId })
      toast.success('Expense deleted successfully')

      invalidateAfterMutation()
      // After a delete the expense Detail_Page no longer exists (it would
      // 404), so we return to the group expense list rather than the edit
      // mode's usual Detail_Page target — matching the original dialog's
      // post-delete navigation.
      router.push(getEditorReturnPath({ kind: 'new', groupId }))
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete expense')
    }
  }

  if (!formGroup || !profile) {
    return null
  }

  // Group is fixed by the route; the control only adds outside friends. Hidden
  // in edit mode, mirroring the dialog (which shows the participant header only
  // when creating).
  const scrollHeader = !isEditMode ? (
    <OutsideParticipantControl
      friends={friends}
      groupMembers={group?.participants ?? []}
      userGroups={[]}
      selectedGroup={group ? { id: group.id, name: group.name } : null}
      selectedFriends={selectedFriends}
      groupLocked
      onSelectGroup={() => {}}
      onRemoveGroup={() => {}}
      onSelectFriend={(friend) =>
        setSelectedFriends((current) => [...current, friend])
      }
      onRemoveFriend={(friendId) =>
        setSelectedFriends((current) =>
          current.filter((f) => f.id !== friendId),
        )
      }
    />
  ) : null

  return (
    <div className="min-w-0 [&_[data-slot=button]:focus-visible]:ring-inset">
      {paymentMode ? (
        <PaymentForm
          group={formGroup}
          expense={editingExpense || undefined}
          createPrefill={createPrefill}
          currentUserId={profile.id}
          onSubmit={handleSubmit}
          onDelete={isEditMode ? handleDelete : undefined}
          scrollHeader={scrollHeader}
          containedScroll={false}
        />
      ) : (
        <ExpenseForm
          group={formGroup}
          categories={categories}
          expense={editingExpense || undefined}
          createPrefill={createPrefill}
          currentUserId={profile.id}
          preferredCurrency={profile.preferredCurrency}
          onSubmit={handleSubmit}
          onDelete={isEditMode ? handleDelete : undefined}
          runtimeFeatureFlags={runtimeFeatureFlags}
          isDesktop={isDesktop}
          scrollHeader={scrollHeader}
          // Hybrid (group + outside friends) path only persists the first payer,
          // exactly as the dialog does when friends are selected.
          singlePayerOnly={selectedFriends.length > 0}
          containedScroll={false}
        />
      )}
    </div>
  )
}
