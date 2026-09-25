'use client'

import {
  ExpenseForm,
  ExpenseFormCreatePrefill,
} from '@/app/groups/[groupId]/expenses/expense-form'
import { PaymentForm } from '@/app/groups/[groupId]/expenses/payment-form'
import { OutsideParticipantControl } from '@/components/expense-editor/outside-participant-control'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/components/ui/empty'
import { toast } from '@/components/ui/toast'
import { Locale } from '@/i18n'
import { getCurrency } from '@/lib/currency'
import { consumeStandaloneExpenseCreate } from '@/lib/expense-prefill-store'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { FriendListItem } from '@/lib/friends'
import { useMediaQuery } from '@/lib/hooks'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { ExpenseFormValues } from '@/lib/schemas'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ExternalLink, Users } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

const defaultRuntimeFeatureFlags: RuntimeFeatureFlags = {
  enableExpenseDocuments: false,
  enableReceiptExtract: false,
  enableCategoryExtract: false,
}

/**
 * Create an expense with no group in the URL.
 *
 * At most one group, plus any friends who are not already in that group.
 * Friends alone (no group) stay supported.
 */
export function StandaloneExpenseCreate({
  runtimeFeatureFlags = defaultRuntimeFeatureFlags,
}: {
  runtimeFeatureFlags?: RuntimeFeatureFlags
}) {
  const t = useTranslations('FloatingCreateExpense')
  const tDecomp = useTranslations('ExpenseForm.decompositionBanner')
  const locale = useLocale() as Locale
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const utils = trpc.useUtils()

  const consumed = useRef(false)
  const [createPrefill, setCreatePrefill] = useState<
    ExpenseFormCreatePrefill | undefined
  >(undefined)
  const [selectedGroup, setSelectedGroup] = useState<{
    id: string
    name: string
  } | null>(null)
  const [selectedFriends, setSelectedFriends] = useState<FriendListItem[]>([])

  const { data: friends = [] } = trpc.friends.list.useQuery()
  const { data: userGroups = [] } =
    trpc.groupMembership.getUserGroups.useQuery()
  const { data: profile } = trpc.profile.getProfile.useQuery()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories ?? []

  const { data: groupDetail } = trpc.groups.get.useQuery(
    { groupId: selectedGroup?.id ?? '' },
    { enabled: !!selectedGroup },
  )

  const { mutateAsync: createGroupExpense } =
    trpc.groups.expenses.create.useMutation()
  const { mutateAsync: createDirectExpense } =
    trpc.friends.createDirectExpense.useMutation()
  const { mutateAsync: createGlobalExpense } =
    trpc.friends.createGlobalExpense.useMutation()
  const { mutateAsync: recordDirectPayment } =
    trpc.friends.recordDirectPayment.useMutation()

  useEffect(() => {
    if (consumed.current) return
    consumed.current = true
    const handoff = consumeStandaloneExpenseCreate()
    if (!handoff) return
    setCreatePrefill(handoff.prefill)

    const applyFriend = async () => {
      if (handoff.friendId) {
        const cached = friends.find((friend) => friend.id === handoff.friendId)
        if (cached) {
          setSelectedFriends([cached])
          return
        }
        try {
          const friend = await utils.friends.getFriend.fetch({
            friendId: handoff.friendId,
          })
          setSelectedFriends([
            {
              id: friend.id,
              email: friend.email,
              name: friend.name,
              friendUserId: friend.friendUserId,
              friendUsername: null,
              hasAccount: friend.isConnected,
              status: friend.isConnected ? 'connected' : 'pending',
            },
          ])
        } catch {
          // Leave the picker empty when the friend cannot be resolved.
        }
        return
      }
      if (handoff.friendUsername) {
        const cached = friends.find(
          (friend) => friend.friendUsername === handoff.friendUsername,
        )
        if (cached) {
          setSelectedFriends([cached])
          return
        }
        try {
          const friend = await utils.friends.getFriendByUsername.fetch({
            username: handoff.friendUsername,
          })
          setSelectedFriends([
            {
              id: friend.id,
              email: friend.email,
              name: friend.name,
              friendUserId: friend.friendUserId,
              friendUsername: handoff.friendUsername,
              hasAccount: friend.isConnected,
              status: friend.isConnected ? 'connected' : 'pending',
            },
          ])
        } catch {
          // Leave the picker empty when the friend cannot be resolved.
        }
      }
    }
    void applyFriend()
  }, [friends, utils])

  const groupParticipants = useMemo(
    () => groupDetail?.group?.participants ?? [],
    [groupDetail],
  )

  useEffect(() => {
    if (groupParticipants.length === 0) return
    setSelectedFriends((current) => {
      const next = current.filter(
        (friend) =>
          !groupParticipants.some(
            (member) => member.id === (friend.friendUserId ?? friend.id),
          ),
      )
      return next.length === current.length ? current : next
    })
  }, [groupParticipants])

  const participants = useMemo(() => {
    if (!profile) return []
    const uniqueMap = new Map<
      string,
      { id: string; name: string; email: string | null }
    >()
    uniqueMap.set(profile.id, {
      id: profile.id,
      name: profile.name || t('you'),
      email: profile.email || null,
    })
    for (const friend of selectedFriends) {
      const resolvedId = friend.friendUserId ?? friend.id
      uniqueMap.set(resolvedId, {
        id: resolvedId,
        name: friend.name,
        email: friend.email || null,
      })
    }
    for (const participant of groupParticipants) {
      uniqueMap.set(participant.id, {
        id: participant.id,
        name: participant.name?.trim() || participant.id,
        email: participant.email ?? null,
      })
    }
    return Array.from(uniqueMap.values())
  }, [groupParticipants, profile, selectedFriends, t])

  const virtualGroup = useMemo(() => {
    if (selectedGroup && groupDetail?.group) {
      return { ...groupDetail.group, participants }
    }
    if (selectedFriends.length > 0 && profile) {
      const directCurrency = profile.preferredCurrency || 'EUR'
      return {
        id: 'direct',
        name: selectedFriends.map((friend) => friend.name).join(', '),
        currency: getCurrency(directCurrency, locale).symbol || '€',
        currencyCode: directCurrency,
        simplifyDebts: true,
        participants: [
          {
            id: profile.id,
            name: profile.name || t('you'),
            email: profile.email,
          },
          ...selectedFriends.map((friend) => ({
            id: friend.friendUserId ?? friend.id,
            name: friend.name,
            email: friend.email,
          })),
        ],
      }
    }
    return null
  }, [
    groupDetail,
    locale,
    participants,
    profile,
    selectedFriends,
    selectedGroup,
    t,
  ])

  const paymentMode = createPrefill?.isReimbursement === true

  const showDecompositionToast = ({
    groupHalfAmount,
    directHalves,
    expenseDetailUrl,
    currencyGroup,
  }: {
    groupHalfAmount: number
    directHalves: Array<{ name: string; amount: number }>
    expenseDetailUrl: string
    currencyGroup: NonNullable<typeof virtualGroup>
  }) => {
    const currency = getCurrencyFromGroup(currencyGroup as never)
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

  const invalidateAfterMutation = () => {
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
    if (!profile || !virtualGroup) return
    try {
      if (selectedGroup) {
        if (selectedFriends.length > 0) {
          const activeCurrency =
            values.originalCurrency || profile.preferredCurrency || 'EUR'
          const currencyObj = getCurrency(activeCurrency, locale)
          const amountMajor = values.amount / 10 ** currencyObj.decimal_digits
          const globalResult = await createGlobalExpense({
            title: values.title,
            amount: amountMajor,
            currency: activeCurrency,
            paidById: values.paidBy[0].participant,
            expenseDate: values.expenseDate,
            notes: values.notes || undefined,
            groupId: selectedGroup.id,
            friendIds: selectedFriends.map((friend) => friend.id),
            splitMode: values.splitMode,
            category: values.category,
            recurrenceRule: values.recurrenceRule,
            documents: values.documents.map((document) => ({
              id: document.id,
              url: document.url,
              width: document.width,
              height: document.height,
            })),
            paidFor: values.paidFor.map((entry) => ({
              participant: entry.participant,
              shares: entry.shares,
            })),
          })
          if ('groupHalf' in globalResult && globalResult.groupHalf) {
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
              groupHalfAmount: globalResult.groupHalf.amount,
              directHalves: (globalResult.directHalves ?? []).map((half) => ({
                name: nameById.get(half.nonMemberId) ?? half.nonMemberId,
                amount: half.amount,
              })),
              expenseDetailUrl: `/groups/${globalResult.groupHalf.groupId}/expenses/${globalResult.groupHalf.id}`,
              currencyGroup: virtualGroup,
            })
          } else {
            toast.success(
              values.isReimbursement
                ? t('paymentSuccessToast')
                : t('successToast'),
            )
          }
        } else {
          const createResult = await createGroupExpense({
            groupId: selectedGroup.id,
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
              expenseDetailUrl: `/groups/${selectedGroup.id}/expenses/${createResult.expense.id}`,
              currencyGroup: virtualGroup,
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
        router.push(`/groups/${selectedGroup.id}/expenses`)
        return
      }

      if (selectedFriends.length === 1 && values.isReimbursement) {
        await recordDirectPayment({
          friendId: selectedFriends[0].id,
          amount: values.amount,
          currency:
            values.originalCurrency || profile.preferredCurrency || 'EUR',
          fromUserId: values.paidBy[0].participant,
          toUserId: values.paidFor[0].participant,
          date: values.expenseDate,
        })
        toast.success(t('paymentSuccessToast'))
      } else if (selectedFriends.length === 1) {
        await createDirectExpense({
          friendId: selectedFriends[0].id,
          title: values.title,
          amount: values.amount,
          currency:
            values.originalCurrency || profile.preferredCurrency || 'EUR',
          paidById: values.paidBy[0].participant,
          expenseDate: values.expenseDate,
          notes: values.notes || undefined,
          recurrenceRule: values.recurrenceRule,
        })
        toast.success(t('successToast'))
      } else if (selectedFriends.length > 1) {
        const activeCurrency =
          values.originalCurrency || profile.preferredCurrency || 'EUR'
        const currencyObj = getCurrency(activeCurrency, locale)
        const amountMajor = values.amount / 10 ** currencyObj.decimal_digits
        await createGlobalExpense({
          title: values.title,
          amount: amountMajor,
          currency: activeCurrency,
          paidById: values.paidBy[0].participant,
          expenseDate: values.expenseDate,
          notes: values.notes || undefined,
          groupId: null,
          friendIds: selectedFriends.map((friend) => friend.id),
          splitMode: values.splitMode,
          category: values.category,
          recurrenceRule: values.recurrenceRule,
          documents: values.documents.map((document) => ({
            id: document.id,
            url: document.url,
            width: document.width,
            height: document.height,
          })),
          paidFor: values.paidFor.map((entry) => ({
            participant: entry.participant,
            shares: entry.shares,
          })),
        })
        toast.success(t('successToast'))
      } else {
        toast.error(t('selectParticipantsHint'))
        return
      }

      invalidateAfterMutation()
      const username = selectedFriends[0]?.friendUsername
      router.push(username ? `/friends/${username}` : '/')
    } catch (err) {
      console.error(err)
      toast.error(t(paymentMode ? 'paymentErrorToast' : 'errorToast'))
    }
  }

  const participantControl = (
    <OutsideParticipantControl
      friends={friends}
      groupMembers={groupParticipants}
      userGroups={userGroups.map((group) => ({
        id: group.id,
        name: group.name,
      }))}
      selectedGroup={selectedGroup}
      selectedFriends={selectedFriends}
      onSelectGroup={(group) => {
        setSelectedGroup(group)
        setSelectedFriends((current) =>
          current.filter(
            (friend) =>
              !groupParticipants.some(
                (member) => member.id === (friend.friendUserId ?? friend.id),
              ),
          ),
        )
      }}
      onRemoveGroup={() => setSelectedGroup(null)}
      onSelectFriend={(friend) =>
        setSelectedFriends((current) => [...current, friend])
      }
      onRemoveFriend={(friendId) =>
        setSelectedFriends((current) =>
          current.filter((friend) => friend.id !== friendId),
        )
      }
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <Button
        type="button"
        variant="link"
        className="h-auto w-fit p-0 text-sm font-normal text-muted-foreground"
        onClick={() => router.back()}
      >
        ← {t('back')}
      </Button>
      {participantControl}
      {virtualGroup && profile ? (
        <div className="min-w-0 [&_[data-slot=button]:focus-visible]:ring-inset">
          {paymentMode ? (
            <PaymentForm
              group={virtualGroup as never}
              createPrefill={createPrefill}
              currentUserId={profile.id}
              onSubmit={handleSubmit}
              containedScroll={false}
            />
          ) : (
            <ExpenseForm
              group={virtualGroup as never}
              categories={categories}
              createPrefill={createPrefill}
              currentUserId={profile.id}
              preferredCurrency={profile.preferredCurrency}
              onSubmit={handleSubmit}
              runtimeFeatureFlags={runtimeFeatureFlags}
              isDesktop={isDesktop}
              singlePayerOnly={selectedFriends.length > 0}
              containedScroll={false}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyDescription>{t('selectParticipantsHint')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent />
          </Empty>
        </div>
      )}
    </div>
  )
}
