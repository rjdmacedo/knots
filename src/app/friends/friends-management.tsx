'use client'

import { Money } from '@/components/money'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { CurrencyBalance } from '@/lib/friend-balances'
import { trpc } from '@/trpc/client'
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

export function FriendsManagement() {
  const t = useTranslations('Friends')
  const tList = useTranslations('Friends.List')
  const [isAdding, setIsAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [showUnblockDialog, setShowUnblockDialog] = useState(false)
  const [pendingBlockedEmail, setPendingBlockedEmail] = useState('')
  const [friendToRemove, setFriendToRemove] = useState<{
    id: string
    name: string
  } | null>(null)
  const utils = trpc.useUtils()

  const { data: friends, isLoading, error } = trpc.friends.list.useQuery()
  const { data: incomingRequests, isLoading: isLoadingRequests } =
    trpc.friends.listIncoming.useQuery()
  const { data: balances, isLoading: isLoadingBalances } =
    trpc.friends.listWithBalances.useQuery()

  const addFriend = trpc.friends.add.useMutation({
    onSuccess: (data) => {
      toast.success(t('addedToast', { name: data.name }))
      setEmail('')
      setName('')
      setIsAdding(false)
      utils.friends.list.invalidate()
      utils.friends.listWithBalances.invalidate()
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const removeFriend = trpc.friends.remove.useMutation({
    onSuccess: () => {
      toast.success(t('removedToast'))
      utils.friends.list.invalidate()
      utils.friends.listWithBalances.invalidate()
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const acceptRequest = trpc.friends.accept.useMutation({
    onSuccess: (data) => {
      toast.success(t('acceptedToast', { name: data.name }))
      utils.friends.list.invalidate()
      utils.friends.listIncoming.invalidate()
      utils.friends.listWithBalances.invalidate()
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const declineRequest = trpc.friends.decline.useMutation({
    onSuccess: () => {
      toast.success(t('declinedToast'))
      utils.friends.listIncoming.invalidate()
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const unblockUser = trpc.profile.unblockUser.useMutation({
    onSuccess: () => {
      utils.profile.getBlockedUsers.invalidate()
      addFriend.mutate({
        email: pendingBlockedEmail,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      setShowUnblockDialog(false)
      setPendingBlockedEmail('')
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const handleAddFriend = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return

    const normalizedEmail = email.trim().toLowerCase()

    const result = await utils.profile.checkBlocked.fetch({
      email: normalizedEmail,
    })

    if (result.blocked) {
      setPendingBlockedEmail(normalizedEmail)
      setShowUnblockDialog(true)
      return
    }

    addFriend.mutate({
      email: normalizedEmail,
      ...(name.trim() ? { name: name.trim() } : {}),
    })
  }

  // Compute aggregate totals per currency and split friends into unsettled/settled
  const aggregateTotals = computeAggregateTotals(balances ?? [])
  const unsettledFriends = (friends ?? []).filter((friend) => {
    if (!friend.friendUserId) return false
    const fb = balances?.find((b) => b.friendId === friend.id)
    if (!fb) return false
    return fb.balances.some((b) => b.totalAmount !== 0)
  })
  const settledFriends = (friends ?? []).filter((friend) => {
    if (!friend.friendUserId) return true // friends without account go to settled section
    const fb = balances?.find((b) => b.friendId === friend.id)
    if (!fb) return true
    return fb.balances.every((b) => b.totalAmount === 0)
  })
  // Pending friends (not yet connected) are always shown separately
  const pendingFriends = (friends ?? []).filter((f) => f.status === 'pending')
  const connectedUnsettled = unsettledFriends.filter(
    (f) => f.status === 'connected',
  )
  const connectedSettled = settledFriends.filter(
    (f) => f.status === 'connected',
  )

  if (isLoading || isLoadingRequests) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        {t('loading')}
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-destructive">{t('loadError')}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Incoming requests section */}
      {incomingRequests && incomingRequests.length > 0 && (
        <section className="rounded-lg border p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">{t('requestsTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('requestsDescription')}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {incomingRequests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {request.requesterName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {request.requesterName}
                    </span>
                    <p className="text-xs text-muted-foreground truncate">
                      {t('wantsToConnect')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    disabled={
                      acceptRequest.isPending || declineRequest.isPending
                    }
                    onClick={() =>
                      acceptRequest.mutate({
                        incomingFriendId: request.id,
                      })
                    }
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    {acceptRequest.isPending ? t('accepting') : t('accept')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={
                      acceptRequest.isPending || declineRequest.isPending
                    }
                    aria-label={t('decline')}
                    onClick={() =>
                      declineRequest.mutate({
                        incomingFriendId: request.id,
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pending friends (not yet connected) */}
      {pendingFriends.length > 0 && (
        <section className="rounded-lg border p-4 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">{t('pending')}</h2>
          </div>
          <ul className="flex flex-col gap-2">
            {pendingFriends.map((friend) => (
              <FriendRow
                key={friend.id}
                friend={friend}
                onRemove={() =>
                  setFriendToRemove({ id: friend.id, name: friend.name })
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* 11.1: Aggregate header */}
      {!isLoadingBalances && (
        <FriendsAggregateHeader totals={aggregateTotals} />
      )}

      {/* 11.2 & 11.4: Non-zero balance friends */}
      {isLoadingBalances ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : connectedUnsettled.length > 0 ? (
        <section className="space-y-2">
          <ul className="flex flex-col gap-2">
            {connectedUnsettled.map((friend) => {
              const friendBalance = balances?.find(
                (b) => b.friendId === friend.id,
              )
              return (
                <FriendDebtRow
                  key={friend.id}
                  friend={friend}
                  balances={friendBalance?.balances ?? []}
                  onRemove={() =>
                    setFriendToRemove({ id: friend.id, name: friend.name })
                  }
                />
              )
            })}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tList('noUnsettledFriends')}
        </p>
      )}

      {/* 11.3: Settled friends collapsible */}
      {connectedSettled.length > 0 && (
        <FriendsSettledSection
          friends={connectedSettled}
          balances={balances ?? []}
          onRemoveFriend={(id, name) => setFriendToRemove({ id, name })}
        />
      )}

      {/* 11.5: Add friend section */}
      <section className="rounded-lg border p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">{t('addTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('addDescription')}</p>
        </div>

        {isAdding ? (
          <form onSubmit={handleAddFriend} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="friend-email">{t('emailLabel')}</Label>
              <Input
                id="friend-email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="text-base"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="friend-name">{t('nameLabel')}</Label>
              <Input
                id="friend-name"
                type="text"
                placeholder={t('namePlaceholder')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="text-base"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={addFriend.isPending || !email.trim()}
              >
                {addFriend.isPending ? t('adding') : t('add')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false)
                  setEmail('')
                  setName('')
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('addFriend')}
          </Button>
        )}
      </section>

      {/* Remove friend dialog */}
      <AlertDialog
        open={friendToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setFriendToRemove(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeFriend')}</AlertDialogTitle>
            <AlertDialogDescription>
              {friendToRemove
                ? t('removeFriendDescription', { name: friendToRemove.name })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (friendToRemove) {
                  removeFriend.mutate({ friendId: friendToRemove.id })
                  setFriendToRemove(null)
                }
              }}
            >
              {t('remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unblock dialog */}
      <AlertDialog open={showUnblockDialog} onOpenChange={setShowUnblockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unblockDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('unblockDialogDescription', { email: pendingBlockedEmail })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowUnblockDialog(false)
                setPendingBlockedEmail('')
              }}
            >
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                unblockUser.mutate({ blockedEmail: pendingBlockedEmail })
              }
              disabled={unblockUser.isPending}
            >
              {unblockUser.isPending ? t('unblocking') : t('unblockAndAdd')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// --- Sub-components ---

type AggregateTotals = {
  owed: { currency: CurrencyBalance['currency']; amount: number }[]
  owing: { currency: CurrencyBalance['currency']; amount: number }[]
}

function computeAggregateTotals(
  balances: { friendId: string; balances: CurrencyBalance[] }[],
): AggregateTotals {
  const owedMap = new Map<
    string,
    { currency: CurrencyBalance['currency']; amount: number }
  >()
  const owingMap = new Map<
    string,
    { currency: CurrencyBalance['currency']; amount: number }
  >()

  for (const friend of balances) {
    for (const b of friend.balances) {
      if (b.totalAmount > 0) {
        // Friend owes me
        const key = b.currency.code
        const existing = owedMap.get(key)
        if (existing) {
          existing.amount += b.totalAmount
        } else {
          owedMap.set(key, { currency: b.currency, amount: b.totalAmount })
        }
      } else if (b.totalAmount < 0) {
        // I owe friend
        const key = b.currency.code
        const existing = owingMap.get(key)
        if (existing) {
          existing.amount += Math.abs(b.totalAmount)
        } else {
          owingMap.set(key, {
            currency: b.currency,
            amount: Math.abs(b.totalAmount),
          })
        }
      }
    }
  }

  return {
    owed: Array.from(owedMap.values()),
    owing: Array.from(owingMap.values()),
  }
}

/** 11.1: Aggregate header showing total owed/owing per currency */
function FriendsAggregateHeader({ totals }: { totals: AggregateTotals }) {
  const tList = useTranslations('Friends.List')

  if (totals.owed.length === 0 && totals.owing.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border p-4 space-y-1">
      {totals.owed.map((entry) => (
        <p
          key={`owed-${entry.currency.code}`}
          className="text-sm font-medium text-credit"
        >
          {totals.owed.length > 1
            ? tList('totalOwedToYouMulti')
            : tList('totalOwedToYouMulti')}{' '}
          <Money currency={entry.currency} amount={entry.amount} colored />
        </p>
      ))}
      {totals.owing.map((entry) => (
        <p
          key={`owing-${entry.currency.code}`}
          className="text-sm font-medium text-debt"
        >
          {tList('totalYouOweMulti')}{' '}
          <Money currency={entry.currency} amount={-entry.amount} colored />
        </p>
      ))}
    </div>
  )
}

/** 11.3: Settled friends collapsible section */
function FriendsSettledSection({
  friends,
  balances,
  onRemoveFriend,
}: {
  friends: {
    id: string
    name: string
    friendUserId: string | null
    friendUsername: string | null
    status: string
  }[]
  balances: { friendId: string; balances: CurrencyBalance[] }[]
  onRemoveFriend: (id: string, name: string) => void
}) {
  const tList = useTranslations('Friends.List')

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full py-2">
        <ChevronDown className="h-4 w-4 transition-transform [[data-panel-open]_&]:rotate-180" />
        {tList('showSettledFriends', { count: friends.length })}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-2 pt-2">
          {friends.map((friend) => {
            const friendBalance = balances?.find(
              (b) => b.friendId === friend.id,
            )
            return (
              <FriendDebtRow
                key={friend.id}
                friend={friend}
                balances={friendBalance?.balances ?? []}
                onRemove={() => onRemoveFriend(friend.id, friend.name)}
              />
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** 11.4: Simplified friend row — avatar + name + balance per currency → link to /friends/[username] */
function FriendDebtRow({
  friend,
  balances,
  onRemove,
}: {
  friend: {
    id: string
    name: string
    friendUserId: string | null
    friendUsername: string | null
    status: string
  }
  balances: CurrencyBalance[]
  onRemove: () => void
}) {
  const t = useTranslations('Friends')
  const tBal = useTranslations('Friends.Balances')
  const nonZeroBalances = balances.filter((b) => b.totalAmount !== 0)

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <Link
        href={friend.friendUsername ? `/friends/${friend.friendUsername}` : '#'}
        className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
          {friend.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{friend.name}</span>
          {nonZeroBalances.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {nonZeroBalances.map((b) => (
                <div key={b.currency.code} className="text-xs">
                  <span className="text-muted-foreground">
                    {b.totalAmount > 0
                      ? tBal('friendOwesYou', { name: friend.name })
                      : tBal('youOweFriend', { name: friend.name })}
                  </span>{' '}
                  <Money
                    currency={b.currency}
                    amount={Math.abs(b.totalAmount)}
                    colored
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{tBal('settled')}</p>
          )}
        </div>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={t('friendActions')}
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            {t('removeFriend')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/** Simple row for pending friends without balance info */
function FriendRow({
  friend,
  onRemove,
}: {
  friend: {
    id: string
    name: string
    email: string
    friendUsername: string | null
    status: string
  }
  onRemove: () => void
}) {
  const t = useTranslations('Friends')

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium ring-2 ring-offset-2 ring-offset-background ring-debt/30">
          {friend.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium">{friend.name}</span>
          <p className="text-xs text-muted-foreground truncate">
            {friend.email}
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={t('friendActions')}
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            {t('removeFriend')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
