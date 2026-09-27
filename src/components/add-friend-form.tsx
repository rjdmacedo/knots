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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import type { FriendListItem } from '@/lib/friends'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

type AddFriendSectionProps = {
  onAdded?: (friend: FriendListItem) => void
  disabled?: boolean
  className?: string
}

export function AddFriendSection({
  onAdded,
  disabled,
  className,
}: AddFriendSectionProps) {
  const t = useTranslations('Friends')
  const [isAdding, setIsAdding] = useState(false)

  return (
    <section className={cn('rounded-lg border p-4 space-y-4', className)}>
      <div>
        <h2 className="font-semibold text-lg">{t('addTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('addDescription')}</p>
      </div>

      {isAdding ? (
        <AddFriendForm
          autoFocus
          disabled={disabled}
          onAdded={(friend) => {
            setIsAdding(false)
            onAdded?.(friend)
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('addFriend')}
        </Button>
      )}
    </section>
  )
}

function AddFriendForm({
  onAdded,
  onCancel,
  autoFocus,
  disabled,
}: {
  onAdded: (friend: FriendListItem) => void
  onCancel: () => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  const t = useTranslations('Friends')
  const emailId = useId()
  const nameId = useId()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [showUnblockDialog, setShowUnblockDialog] = useState(false)
  const [pendingBlockedEmail, setPendingBlockedEmail] = useState('')
  const utils = trpc.useUtils()

  const addFriend = trpc.friends.add.useMutation({
    onSuccess: (data) => {
      toast.success(t('addedToast', { name: data.name }))
      setEmail('')
      setName('')
      utils.friends.list.invalidate()
      utils.friends.listWithBalances.invalidate()
      onAdded(data)
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

  const pending = addFriend.isPending || unblockUser.isPending || disabled

  async function submitFriend() {
    if (!email.trim() || pending) return

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

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor={emailId}>{t('emailLabel')}</Label>
          <Input
            id={emailId}
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submitFriend()
              }
            }}
            className="text-base"
            autoFocus={autoFocus}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={nameId}>{t('nameLabel')}</Label>
          <Input
            id={nameId}
            type="text"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submitFriend()
              }
            }}
            className="text-base"
            disabled={pending}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || !email.trim()}
            onClick={() => void submitFriend()}
          >
            {addFriend.isPending ? t('adding') : t('add')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={addFriend.isPending}
            onClick={() => {
              setEmail('')
              setName('')
              onCancel()
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      </div>

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
    </>
  )
}
