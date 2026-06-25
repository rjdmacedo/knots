'use client'

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
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import {
  Loader2,
  MoreVertical,
  Plus,
  Receipt,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { FriendBalanceSummary } from './friend-balance-summary'

export function FriendsManagement() {
  const t = useTranslations('Friends')
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

  const t_bal = useTranslations('Friends.Balances')
  const { data: friends, isLoading, error } = trpc.friends.list.useQuery()
  const { data: incomingRequests, isLoading: isLoadingRequests } =
    trpc.friends.listIncoming.useQuery()
  const {
    data: balances,
    isLoading: isLoadingBalances,
    error: balanceError,
    refetch: refetchBalances,
  } = trpc.friends.listWithBalances.useQuery()

  const addFriend = trpc.friends.add.useMutation({
    onSuccess: (data) => {
      toast.success(t('addedToast', { name: data.name }))
      setEmail('')
      setName('')
      setIsAdding(false)
      utils.friends.list.invalidate()
    },
    onError: (mutationError) => {
      toast.error(mutationError.message)
    },
  })

  const removeFriend = trpc.friends.remove.useMutation({
    onSuccess: () => {
      toast.success(t('removedToast'))
      utils.friends.list.invalidate()
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
      // After unblocking, proceed with the add
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

    // Check if this email is blocked by the current user
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

      <section className="rounded-lg border p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">{t('listTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('listDescription')}
          </p>
        </div>

        {friends && friends.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {friends.map((friend) => {
              const hasAccount = friend.friendUserId !== null
              const friendBalance = balances?.find(
                (b) => b.friendId === friend.id,
              )

              return (
                <li
                  key={friend.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium ring-2 ring-offset-2 ring-offset-background',
                        friend.status === 'pending'
                          ? 'ring-debt/30'
                          : 'ring-primary/70',
                      )}
                    >
                      {friend.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium">
                          {friend.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {friend.hasAccount ? t('hasAccount') : t('noAccount')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {friend.email}
                      </p>
                      {hasAccount && (
                        <div className="mt-1">
                          {isLoadingBalances ? (
                            <Skeleton className="h-3 w-24" />
                          ) : balanceError ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-destructive">
                                {t_bal('loadError')}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs"
                                onClick={() => refetchBalances()}
                              >
                                {t_bal('retry')}
                              </Button>
                            </div>
                          ) : friendBalance ? (
                            <Link
                              href={`/friends/${friend.friendUsername}/expenses`}
                              className="hover:underline"
                            >
                              <FriendBalanceSummary
                                balances={friendBalance.balances}
                                friendName={friend.name}
                              />
                            </Link>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {hasAccount && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Link
                              href={`/friends/${friend.friendUsername}/expenses`}
                              className={cn(
                                buttonVariants({
                                  variant: 'outline',
                                  size: 'icon-sm',
                                }),
                              )}
                              aria-label={t('viewFriendExpenses')}
                            />
                          }
                        >
                          <Receipt className="size-4" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('viewFriendExpenses')}
                        </TooltipContent>
                      </Tooltip>
                    )}

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
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setFriendToRemove({
                              id: friend.id,
                              name: friend.name,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('removeFriend')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        )}
      </section>

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
