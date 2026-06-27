'use client'

import {
  ExpenseForm,
  ExpenseFormCreatePrefill,
} from '@/app/groups/[groupId]/expenses/expense-form'
import { PaymentForm } from '@/app/groups/[groupId]/expenses/payment-form'
import {
  AnimatedCollapse,
  AnimatedLayout,
  layoutTransition,
} from '@/components/animated-collapse'
import {
  ExpenseParticipantPicker,
  ExpenseParticipantTrigger,
} from '@/components/expense-participant-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import { Locale } from '@/i18n'
import { getCurrency } from '@/lib/currency'
import { parseExpenseCreateContext } from '@/lib/expense-create-context'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { FriendListItem } from '@/lib/friends'
import { useMediaQuery, useScrollAtTop } from '@/lib/hooks'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { isConsolidatedPayment } from '@/lib/payments'
import { ExpenseFormValues } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useIsClient } from 'foxact/use-is-client'
import { Plus } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type FloatingCreateExpenseProps = {
  runtimeFeatureFlags?: RuntimeFeatureFlags
}

const fabTransition = {
  duration: 0.3,
  ease: [0.32, 0.72, 0, 1] as const,
}

/** Matches tailwind bottom-20 / bottom-4 — FAB sits above footer at top, aligns with right-4 when footer hides. */
const fabBottomAtTop = 80
const fabBottomScrolled = 16

function FloatingActionButton({
  isAtTop,
  onClick,
  label,
}: {
  isAtTop: boolean
  onClick: () => void
  label: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{
        bottom: isAtTop ? fabBottomAtTop : fabBottomScrolled,
        paddingInline: isAtTop ? 20 : 0,
      }}
      transition={fabTransition}
      className="fixed right-4 z-40 flex h-12 min-w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95"
      aria-label={label}
    >
      <Plus className="h-6 w-6 shrink-0" />
      <motion.span
        initial={false}
        animate={{
          opacity: isAtTop ? 1 : 0,
          maxWidth: isAtTop ? 240 : 0,
          marginInlineStart: isAtTop ? 8 : 0,
        }}
        transition={fabTransition}
        className="overflow-hidden whitespace-nowrap font-semibold text-sm tracking-wide"
        aria-hidden={!isAtTop}
      >
        {label}
      </motion.span>
    </motion.button>
  )
}

export function FloatingCreateExpense({
  runtimeFeatureFlags = {
    enableExpenseDocuments: false,
    enableReceiptExtract: false,
    enableCategoryExtract: false,
  },
}: FloatingCreateExpenseProps) {
  const t = useTranslations('FloatingCreateExpense')
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const isClient = useIsClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const utils = trpc.useUtils()

  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const isAtTop = useScrollAtTop(!open)
  const [footerPortal, setFooterPortal] = useState<HTMLElement | null>(null)

  // Edit States
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<any>(null)

  // Creation / Selection States
  const [selectedGroup, setSelectedGroup] = useState<{
    id: string
    name: string
  } | null>(null)
  const [selectedFriends, setSelectedFriends] = useState<FriendListItem[]>([])
  const [createPrefill, setCreatePrefill] =
    useState<ExpenseFormCreatePrefill | null>(null)
  const [formInstanceKey, setFormInstanceKey] = useState(0)

  // Queries
  const { data: friends = [] } = trpc.friends.list.useQuery(undefined, {
    enabled: open,
  })
  const { data: userGroups = [] } = trpc.groupMembership.getUserGroups.useQuery(
    undefined,
    { enabled: open },
  )
  const { data: profile } = trpc.profile.getProfile.useQuery(undefined, {
    enabled: open,
  })
  const { data: categoriesData } = trpc.categories.list.useQuery(undefined, {
    enabled: open,
  })
  const categories = categoriesData?.categories ?? []

  // Mutations
  const { mutateAsync: createGroupExpense } =
    trpc.groups.expenses.create.useMutation()
  const { mutateAsync: createDirectExpense } =
    trpc.friends.createDirectExpense.useMutation()
  const { mutateAsync: createGlobalExpense } =
    trpc.friends.createGlobalExpense.useMutation()
  const { mutateAsync: updateDirectExpense } =
    trpc.friends.updateDirectExpense.useMutation()
  const { mutateAsync: deleteDirectExpense } =
    trpc.friends.deleteDirectExpense.useMutation()
  const { mutateAsync: updateGroupExpense } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteGroupExpense } =
    trpc.groups.expenses.delete.useMutation()
  const { mutateAsync: recordDirectPayment } =
    trpc.friends.recordDirectPayment.useMutation()

  const isPaymentMode =
    editingExpense?.isReimbursement === true ||
    createPrefill?.isReimbursement === true

  // Fetch selected group details to get group participants
  const { data: groupDetail } = trpc.groups.get.useQuery(
    { groupId: selectedGroup?.id ?? '' },
    { enabled: !!selectedGroup && open },
  )
  const groupParticipants = useMemo(
    () => groupDetail?.group?.participants ?? [],
    [groupDetail],
  )

  useEffect(() => {
    const handleCreateGroupExpense = (e: Event) => {
      const customEvent = e as CustomEvent<{
        groupId: string
        groupName: string
        prefill?: ExpenseFormCreatePrefill
      }>
      const { groupId, groupName, prefill } = customEvent.detail

      setEditingExpenseId(null)
      setEditingGroupId(null)
      setEditingExpense(null)
      setSelectedFriends([])
      setSelectedGroup({ id: groupId, name: groupName })
      setCreatePrefill(prefill ?? null)
      setFormInstanceKey((key) => key + 1)
      setPickerOpen(false)
      setOpen(true)
    }

    window.addEventListener(
      'create-group-expense',
      handleCreateGroupExpense as EventListener,
    )
    return () => {
      window.removeEventListener(
        'create-group-expense',
        handleCreateGroupExpense as EventListener,
      )
    }
  }, [])

  // Derive unique participants list for virtual group
  const participants = useMemo(() => {
    if (!profile) return []
    const uniqueMap = new Map<
      string,
      { id: string; name: string; email: string | null }
    >()

    // Always include current user
    uniqueMap.set(profile.id, {
      id: profile.id,
      name: profile.name || t('you'),
      email: profile.email || null,
    })

    // Include selected friends (mapping Friend.id or friendUserId if exists)
    selectedFriends.forEach((f) => {
      const resolvedId = f.friendUserId ?? f.id
      uniqueMap.set(resolvedId, {
        id: resolvedId,
        name: f.name,
        email: f.email || null,
      })
    })

    // Include selected group members
    groupParticipants.forEach((p) => {
      uniqueMap.set(p.id, {
        id: p.id,
        name: p.name ?? '',
        email: p.email ?? null,
      })
    })

    return Array.from(uniqueMap.values())
  }, [profile, selectedFriends, groupParticipants, t])

  // Virtual group structure for the form
  const virtualGroup = useMemo(() => {
    if (selectedGroup && groupDetail?.group) {
      return {
        ...groupDetail.group,
        participants,
      }
    }
    if (selectedFriends.length > 0 && profile) {
      const list = [
        {
          id: profile.id,
          name: profile.name || t('you'),
          email: profile.email,
        },
        ...selectedFriends.map((f) => ({
          id: f.friendUserId ?? f.id,
          name: f.name,
          email: f.email,
        })),
      ]
      const directCurrency = profile.preferredCurrency || 'EUR'
      const currencySymbol = getCurrency(directCurrency, locale).symbol || '€'
      return {
        id: 'direct',
        name: selectedFriends.map((f) => f.name).join(', '),
        currency: currencySymbol,
        currencyCode: directCurrency,
        simplifyDebts: true,
        participants: list,
      }
    }
    return null
  }, [
    selectedGroup,
    groupDetail,
    participants,
    selectedFriends,
    profile,
    locale,
    t,
  ])

  const clearExpenseFormState = useCallback(() => {
    setSelectedGroup(null)
    setSelectedFriends([])
    setEditingExpenseId(null)
    setEditingGroupId(null)
    setEditingExpense(null)
    setCreatePrefill(null)
    setPickerOpen(false)
  }, [])

  const resetForm = useCallback(() => {
    clearExpenseFormState()
    setOpen(false)
  }, [clearExpenseFormState])

  useEffect(() => {
    const handleEditDirectEvent = async (e: Event) => {
      const customEvent = e as CustomEvent<{ expenseId: string }>
      const expenseId = customEvent.detail.expenseId

      try {
        clearExpenseFormState()
        setOpen(true)
        setEditingExpenseId(expenseId)
        setFormInstanceKey((key) => key + 1)

        const data = await utils.friends.getDirectExpense.fetch({ expenseId })
        if (data?.expense) {
          if (isConsolidatedPayment(data.expense)) {
            toast.error(t('lockedPaymentToast'))
            resetForm()
            return
          }
          setEditingExpense(data.expense)
          if (data.friend) {
            setSelectedFriends([data.friend])
          }
        }
      } catch (err) {
        console.error('Failed to fetch direct expense for editing:', err)
        toast.error('Failed to load expense details')
        resetForm()
      }
    }

    window.addEventListener('edit-direct-expense', handleEditDirectEvent as any)
    return () => {
      window.removeEventListener(
        'edit-direct-expense',
        handleEditDirectEvent as any,
      )
    }
  }, [utils, clearExpenseFormState, resetForm, t])

  useEffect(() => {
    const handleEditGroupEvent = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        groupId: string
        expenseId: string
      }>
      const { groupId, expenseId } = customEvent.detail

      try {
        clearExpenseFormState()
        setOpen(true)
        setEditingExpenseId(expenseId)
        setEditingGroupId(groupId)
        setFormInstanceKey((key) => key + 1)

        const [groupData, expenseData] = await Promise.all([
          utils.groups.get.fetch({ groupId }),
          utils.groups.expenses.get.fetch({ groupId, expenseId }),
        ])

        if (groupData?.group && expenseData?.expense) {
          if (isConsolidatedPayment(expenseData.expense)) {
            toast.error(t('lockedPaymentToast'))
            resetForm()
            return
          }
          setSelectedGroup({ id: groupId, name: groupData.group.name })
          setEditingExpense(expenseData.expense)
        }
      } catch (err) {
        console.error('Failed to fetch group expense for editing:', err)
        toast.error('Failed to load expense details')
        resetForm()
      }
    }

    window.addEventListener('edit-group-expense', handleEditGroupEvent as any)
    return () => {
      window.removeEventListener(
        'edit-group-expense',
        handleEditGroupEvent as any,
      )
    }
  }, [utils, clearExpenseFormState, resetForm, t])

  const openForCreate = useCallback(async () => {
    clearExpenseFormState()
    setFormInstanceKey((key) => key + 1)

    const context = parseExpenseCreateContext(pathname)

    if (context?.type === 'group') {
      const cachedGroup = userGroups.find(
        (group) => group.id === context.groupId,
      )
      if (cachedGroup) {
        setSelectedGroup({ id: cachedGroup.id, name: cachedGroup.name })
      } else {
        try {
          const data = await utils.groups.get.fetch({
            groupId: context.groupId,
          })
          if (data?.group) {
            setSelectedGroup({ id: data.group.id, name: data.group.name })
          }
        } catch {
          // User may not have access — leave unselected.
        }
      }
    } else if (context?.type === 'friend') {
      const cachedFriend = friends.find(
        (friend) => friend.friendUsername === context.username,
      )
      if (cachedFriend) {
        setSelectedFriends([cachedFriend])
      } else {
        try {
          const friend = await utils.friends.getFriendByUsername.fetch({
            username: context.username,
          })
          setSelectedFriends([
            {
              id: friend.id,
              email: friend.email,
              name: friend.name,
              friendUserId: friend.friendUserId,
              friendUsername: context.username,
              hasAccount: friend.isConnected,
              status: friend.isConnected ? 'connected' : 'pending',
            },
          ])
        } catch {
          // Friend not found — leave unselected.
        }
      }
    }

    setOpen(true)
  }, [clearExpenseFormState, friends, pathname, userGroups, utils])

  const handleSubmit = async (values: ExpenseFormValues) => {
    try {
      if (editingExpenseId) {
        if (editingGroupId) {
          await updateGroupExpense({
            expenseId: editingExpenseId,
            groupId: editingGroupId,
            expenseFormValues: values,
          })
        } else {
          await updateDirectExpense({
            expenseId: editingExpenseId,
            expenseFormValues: values,
          })
        }
        toast.success(
          t(isPaymentMode ? 'paymentUpdateSuccessToast' : 'updateSuccessToast'),
        )
      } else {
        // Create mode
        if (selectedGroup) {
          if (selectedFriends.length > 0) {
            // Hybrid: group + friends outside the group
            const activeCurrency =
              values.originalCurrency || profile?.preferredCurrency || 'EUR'
            const currencyObj = getCurrency(activeCurrency, locale)
            const amountMajor = values.amount / 10 ** currencyObj.decimal_digits

            await createGlobalExpense({
              title: values.title,
              amount: amountMajor,
              currency: activeCurrency,
              paidById: values.paidBy,
              expenseDate: values.expenseDate,
              notes: values.notes || undefined,
              groupId: selectedGroup.id,
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
            toast.success(
              values.isReimbursement
                ? t('paymentSuccessToast')
                : t('successToast'),
            )
          } else {
            // Group expense
            await createGroupExpense({
              groupId: selectedGroup.id,
              expenseFormValues: values,
            })
            toast.success(
              values.isReimbursement
                ? t('paymentSuccessToast')
                : t('successToast'),
            )
          }
        } else if (selectedFriends.length === 1 && values.isReimbursement) {
          await recordDirectPayment({
            friendId: selectedFriends[0].id,
            amount: values.amount,
            currency:
              values.originalCurrency || profile?.preferredCurrency || 'EUR',
            fromUserId: values.paidBy,
            toUserId: values.paidFor[0].participant,
            date: values.expenseDate,
          })
          toast.success(t('paymentSuccessToast'))
        } else if (selectedFriends.length === 1) {
          // Single direct expense
          await createDirectExpense({
            friendId: selectedFriends[0].id,
            title: values.title,
            amount: values.amount,
            currency:
              values.originalCurrency || profile?.preferredCurrency || 'EUR',
            paidById: values.paidBy,
            expenseDate: values.expenseDate,
            notes: values.notes || undefined,
            recurrenceRule: values.recurrenceRule,
          })
          toast.success(t('successToast'))
        } else if (selectedFriends.length > 1) {
          // Multi-friend direct expenses
          const activeCurrency =
            values.originalCurrency || profile?.preferredCurrency || 'EUR'
          const currencyObj = getCurrency(activeCurrency, locale)
          const amountMajor = values.amount / 10 ** currencyObj.decimal_digits

          await createGlobalExpense({
            title: values.title,
            amount: amountMajor,
            currency: activeCurrency,
            paidById: values.paidBy,
            expenseDate: values.expenseDate,
            notes: values.notes || undefined,
            groupId: null,
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
          toast.success(t('successToast'))
        } else {
          toast.error('Please select a group or a friend')
          return
        }
      }

      // Invalidate all related queries
      if (editingExpenseId) {
        if (editingGroupId) {
          void utils.groups.expenses.get.invalidate({
            groupId: editingGroupId,
            expenseId: editingExpenseId,
          })
        } else {
          void utils.friends.getDirectExpense.invalidate({
            expenseId: editingExpenseId,
          })
        }
      }
      utils.friends.listWithBalances.invalidate()
      utils.friends.getDirectExpenses.invalidate()
      utils.friends.getBalanceDetail.invalidate()
      utils.groupMembership.getUserGroups.invalidate()
      utils.friends.getTimeline.invalidate()
      utils.groups.expenses.invalidate()
      utils.groups.balances.invalidate()
      invalidateActivityQueries(utils)

      resetForm()
    } catch (err) {
      console.error(err)
      toast.error(
        t(
          editingExpenseId
            ? isPaymentMode
              ? 'paymentUpdateErrorToast'
              : 'updateErrorToast'
            : isPaymentMode
              ? 'paymentErrorToast'
              : 'errorToast',
        ),
      )
    }
  }

  const handleDelete = async () => {
    if (!editingExpenseId) return
    const expenseId = editingExpenseId
    const groupId = editingGroupId
    try {
      if (groupId) {
        await deleteGroupExpense({
          expenseId,
          groupId,
        })
      } else {
        await deleteDirectExpense({ expenseId })
      }
      toast.success('Expense deleted successfully')

      if (groupId) {
        void utils.groups.expenses.get.invalidate({ groupId, expenseId })
      } else {
        void utils.friends.getDirectExpense.invalidate({ expenseId })
      }
      utils.friends.listWithBalances.invalidate()
      utils.friends.getDirectExpenses.invalidate()
      utils.friends.getBalanceDetail.invalidate()
      utils.friends.getTimeline.invalidate()
      utils.groups.expenses.invalidate()
      utils.groups.balances.invalidate()
      invalidateActivityQueries(utils)

      resetForm()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete expense')
    }
  }

  const renderContent = () => {
    return (
      <AnimatedLayout className="flex min-w-0 flex-col gap-4 pt-3">
        {!editingExpenseId && (
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('withWho')}
            </Label>
            <ExpenseParticipantTrigger
              selectedGroup={selectedGroup}
              selectedFriends={selectedFriends}
              onClick={() => setPickerOpen(true)}
            />
          </div>
        )}

        <AnimatedCollapse open={!!virtualGroup} className="border-t pt-4">
          {virtualGroup ? (
            isPaymentMode ? (
              <PaymentForm
                key={`payment-${virtualGroup.id}-${editingExpenseId || 'new'}-${formInstanceKey}`}
                group={virtualGroup as any}
                expense={editingExpense || undefined}
                createPrefill={createPrefill ?? undefined}
                currentUserId={profile?.id}
                onSubmit={handleSubmit}
                onDelete={editingExpenseId ? handleDelete : undefined}
                onCancel={resetForm}
                embedded
                footerPortal={footerPortal}
              />
            ) : (
              <ExpenseForm
                key={`${virtualGroup.id}-${editingExpenseId || 'new'}-${formInstanceKey}`}
                group={virtualGroup as any}
                categories={categories}
                expense={editingExpense || undefined}
                createPrefill={createPrefill ?? undefined}
                currentUserId={profile?.id}
                preferredCurrency={profile?.preferredCurrency}
                onSubmit={handleSubmit}
                onDelete={editingExpenseId ? handleDelete : undefined}
                onCancel={resetForm}
                runtimeFeatureFlags={runtimeFeatureFlags}
                isDesktop={isDesktop}
                embedded
                footerPortal={footerPortal}
              />
            )
          ) : null}
        </AnimatedCollapse>

        <AnimatedCollapse open={!virtualGroup && !editingExpenseId}>
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
            <p>{t('selectParticipantsHint')}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPickerOpen(true)}
            >
              {t('selectParticipants')}
            </Button>
          </div>
        </AnimatedCollapse>
      </AnimatedLayout>
    )
  }

  const renderParticipantPicker = () => (
    <ExpenseParticipantPicker
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      isDesktop={isDesktop}
      userGroups={userGroups}
      friends={friends}
      selectedGroup={selectedGroup}
      selectedFriends={selectedFriends}
      onSelectGroup={setSelectedGroup}
      onSelectFriend={(friend) => {
        setSelectedFriends((current) => [...current, friend])
      }}
      onRemoveGroup={() => setSelectedGroup(null)}
      onRemoveFriend={(friendId) => {
        setSelectedFriends((current) =>
          current.filter((f) => f.id !== friendId),
        )
      }}
    />
  )

  const renderShell = (header: React.ReactNode) => (
    <LayoutGroup id="floating-create-expense">
      <motion.div
        layout
        className="flex max-h-[inherit] min-h-0 min-w-0 flex-1 flex-col"
        transition={layoutTransition}
      >
        {header}
        <motion.div
          layout
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-none"
          transition={layoutTransition}
        >
          {renderContent()}
        </motion.div>
        {(virtualGroup || editingExpenseId) && (
          <div
            ref={setFooterPortal}
            className={cn('shrink-0 border-t pt-4', !isDesktop && 'mt-auto')}
          />
        )}
      </motion.div>
    </LayoutGroup>
  )

  if (!isClient) return null

  if (isDesktop) {
    return (
      <>
        {/* Floating Action Button */}
        <FloatingActionButton
          isAtTop={isAtTop}
          label={t('addExpense')}
          onClick={openForCreate}
        />

        {/* Expense Creator Dialog */}
        <Dialog
          open={open}
          onOpenChange={(val) => {
            setOpen(val)
            if (!val) resetForm()
          }}
        >
          <DialogContent className="flex w-full min-w-0 max-h-[90dvh] flex-col gap-0 overflow-x-hidden overflow-hidden p-6 sm:max-w-2xl">
            {renderShell(
              <DialogHeader className="shrink-0 border-b pb-3">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {editingExpenseId
                    ? t(
                        isPaymentMode
                          ? 'editPaymentDialogTitle'
                          : 'editDialogTitle',
                      )
                    : t(
                        isPaymentMode
                          ? 'createPaymentDialogTitle'
                          : 'dialogTitle',
                      )}
                </DialogTitle>
              </DialogHeader>,
            )}
          </DialogContent>
        </Dialog>
        {renderParticipantPicker()}
      </>
    )
  }

  return (
    <>
      {/* Floating Action Button */}
      <FloatingActionButton
        isAtTop={isAtTop}
        label={t('addExpense')}
        onClick={openForCreate}
      />

      {/* Expense Creator Drawer */}
      <Drawer
        open={open}
        onOpenChange={(val) => {
          setOpen(val)
          if (!val) resetForm()
        }}
      >
        <DrawerContent className="flex max-h-[85vh] min-w-0 flex-col gap-0 overflow-x-hidden overflow-hidden p-6">
          {renderShell(
            <DrawerHeader className="shrink-0 border-b pb-3 text-left">
              <DrawerTitle className="text-lg font-bold text-foreground">
                {editingExpenseId
                  ? t(
                      isPaymentMode
                        ? 'editPaymentDialogTitle'
                        : 'editDialogTitle',
                    )
                  : t(
                      isPaymentMode
                        ? 'createPaymentDialogTitle'
                        : 'dialogTitle',
                    )}
              </DrawerTitle>
            </DrawerHeader>,
          )}
        </DrawerContent>
      </Drawer>
      {renderParticipantPicker()}
    </>
  )
}
