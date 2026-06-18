'use client'

import { FriendPicker, type FriendSelection } from '@/components/friend-picker'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { trpc } from '@/trpc/client'
import { Loader2, ShieldBan, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

type BlockedUserEntry = {
  id: string
  blockedEmail: string
  blockedUserId: string | null
  name: string
  email: string
  createdAt: Date
}

export function BlockedUsers() {
  const t = useTranslations('ProfileSettings.BlockedUsers')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingBlock, setPendingBlock] = useState<FriendSelection | null>(null)

  const utils = trpc.useUtils()

  const { data: blockedUsers, isLoading } =
    trpc.profile.getBlockedUsers.useQuery() as {
      data: BlockedUserEntry[] | undefined
      isLoading: boolean
    }

  const blockUser = trpc.profile.blockUser.useMutation({
    onSuccess: () => {
      toast.success(t('blockedToast'))
      setEmail('')
      setPendingBlock(null)
      utils.profile.getBlockedUsers.invalidate()
      utils.friends.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const unblockUser = trpc.profile.unblockUser.useMutation({
    onSuccess: () => {
      toast.success(t('unblockedToast'))
      utils.profile.getBlockedUsers.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function handleBlockByEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    blockUser.mutate({ email: email.trim() })
  }

  function handleBlockFriend(selection: FriendSelection) {
    // Show confirmation dialog warning about friendship removal
    setPendingBlock(selection)
    setShowConfirmDialog(true)
  }

  function confirmBlockFriend() {
    if (!pendingBlock) return
    blockUser.mutate({ email: pendingBlock.email })
    setShowConfirmDialog(false)
  }

  // Exclude already-blocked users from the friend picker
  const blockedUserIds =
    blockedUsers
      ?.map((b) => b.blockedUserId)
      .filter((id): id is string => id !== null) ?? []

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button variant="outline" className="w-full sm:w-auto" />}
        >
          <ShieldBan className="size-4" />
          {t('manage')}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('blockFriendLabel')}</p>
              <FriendPicker
                excludeUserIds={blockedUserIds}
                onSelect={handleBlockFriend}
                placeholder={t('blockFriendPlaceholder')}
                disabled={blockUser.isPending}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t('or')}
                </span>
              </div>
            </div>

            <form onSubmit={handleBlockByEmail} className="flex gap-2">
              <Input
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={blockUser.isPending}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={blockUser.isPending || !email.trim()}
              >
                {blockUser.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  t('block')
                )}
              </Button>
            </form>
          </div>

          <div className="space-y-2 mt-2">
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}

            {!isLoading && blockedUsers?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('empty')}
              </p>
            )}

            {blockedUsers?.map((blocked) => (
              <div
                key={blocked.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{blocked.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {blocked.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() =>
                    unblockUser.mutate({ blockedEmail: blocked.blockedEmail })
                  }
                  disabled={unblockUser.isPending}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">{t('unblock')}</span>
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmBlockTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmBlockDescription', {
                name: pendingBlock?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowConfirmDialog(false)
                setPendingBlock(null)
              }}
            >
              {t('confirmBlockCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBlockFriend}
              disabled={blockUser.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {blockUser.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t('confirmBlockAction')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
