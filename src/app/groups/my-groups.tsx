'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePushNotificationSubscription } from '@/lib/push/use-push-notification-subscription'
import { trpc } from '@/trpc/client'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Loader2,
  LogOut,
  MoreVertical,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

const GROUP_NAME_MIN = 1
const GROUP_NAME_MAX = 100

type UserGroup = {
  id: string
  name: string
  slug: string
  createdAt: Date
  archivedAt: Date | null
  role: 'OWNER' | 'MEMBER'
}

export function MyGroups() {
  const t = useTranslations('MyGroups')
  const { data: profile } = trpc.profile.getProfile.useQuery()
  const {
    data: groups,
    isLoading,
    error,
  } = trpc.groupMembership.getUserGroups.useQuery()
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeGroups = groups?.filter((group) => group.archivedAt == null) ?? []
  const archivedGroups =
    groups?.filter((group) => group.archivedAt != null) ?? []

  if (isLoading) {
    return (
      <MyGroupsLayout>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('loading')}</span>
        </div>
      </MyGroupsLayout>
    )
  }

  if (error) {
    return (
      <MyGroupsLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t('loadError')}</AlertDescription>
        </Alert>
      </MyGroupsLayout>
    )
  }

  return (
    <MyGroupsLayout
      action={
        <CreateGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      }
    >
      {groups && groups.length === 0 ? (
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>{t('noGroups')}</p>
          <p>{t('noGroupsHint')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {activeGroups.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t('activeGroups')}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {activeGroups.map((group) => (
                  <li key={group.id}>
                    <GroupCard group={group} currentUserId={profile?.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {archivedGroups.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t('archivedGroups')}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {archivedGroups.map((group) => (
                  <li key={group.id}>
                    <GroupCard group={group} currentUserId={profile?.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </MyGroupsLayout>
  )
}

function GroupCard({
  group,
  currentUserId,
}: {
  group: UserGroup
  currentUserId: string | undefined
}) {
  const t = useTranslations('MyGroups')
  const tGroups = useTranslations('Groups')
  const tNotifications = useTranslations('Notifications')
  const router = useRouter()
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const utils = trpc.useUtils()
  const pushConfigured = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const notifications = usePushNotificationSubscription(group.id, currentUserId)
  const isArchived = group.archivedAt != null
  const isOwner = group.role === 'OWNER'

  const invalidate = () => utils.groupMembership.getUserGroups.invalidate()

  const leaveGroup = trpc.groups.members.leave.useMutation({
    onSuccess: () => {
      toast.success(t('leaveGroupSuccess', { name: group.name }))
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const archiveGroup = trpc.groups.archive.useMutation({
    onSuccess: () => {
      toast.success(t('archiveSuccess'))
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const unarchiveGroup = trpc.groups.unarchive.useMutation({
    onSuccess: () => {
      toast.success(t('unarchiveSuccess'))
      invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => {
      toast.success(t('deleteSuccess'))
      invalidate()
      router.push('/groups')
    },
    onError: (error) => toast.error(error.message),
  })

  const isBusy =
    leaveGroup.isPending ||
    archiveGroup.isPending ||
    unarchiveGroup.isPending ||
    deleteGroup.isPending

  return (
    <>
      <div className="flex items-center rounded-lg border transition-colors hover:bg-accent">
        <Link
          href={`/groups/${group.slug}`}
          className="flex flex-1 items-center gap-3 px-4 py-3 min-w-0"
        >
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{group.name}</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" />
            }
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {pushConfigured && notifications.isSupported && !isArchived && (
              <>
                <DropdownMenuItem
                  disabled={notifications.isLoading}
                  onSelect={async (e) => {
                    e.preventDefault()
                    notifications.clearError()
                    const errorCode = await notifications.toggle()
                    if (errorCode) {
                      toast.error(tNotifications(errorCode))
                    }
                  }}
                >
                  {notifications.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : notifications.isSubscribed ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                  {notifications.isSubscribed
                    ? tGroups('disableNotifications')
                    : tGroups('enableNotifications')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {isArchived ? (
              <DropdownMenuItem
                disabled={isBusy}
                onClick={() => unarchiveGroup.mutate({ groupId: group.id })}
              >
                <ArchiveRestore className="h-4 w-4" />
                {tGroups('unarchive')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={isBusy}
                onClick={() => archiveGroup.mutate({ groupId: group.id })}
              >
                <Archive className="h-4 w-4" />
                {tGroups('archive')}
              </DropdownMenuItem>
            )}
            {isOwner && (
              <DropdownMenuItem
                variant="destructive"
                disabled={isBusy}
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteGroup')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setLeaveDialogOpen(true)}
            >
              <LogOut className="h-4 w-4" />
              {t('leaveGroup')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leaveGroupConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leaveGroupConfirmDescription', { name: group.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('leaveGroupConfirmCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => leaveGroup.mutate({ groupId: group.id })}
            >
              {t('leaveGroupConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteGroupConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteGroupConfirmDescription', { name: group.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGroup.isPending}>
              {t('deleteGroupConfirmCancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteGroup.isPending}
              onClick={() => deleteGroup.mutate({ groupId: group.id })}
            >
              {t('deleteGroupConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function MyGroupsLayout({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const t = useTranslations('MyGroups')
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-bold text-2xl">{t('title')}</h1>
        {action}
      </div>
      <div>{children}</div>
    </>
  )
}

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('MyGroups')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const utils = trpc.useUtils()

  const createGroup = trpc.groupMembership.createGroup.useMutation({
    onSuccess: async (data) => {
      await utils.groupMembership.getUserGroups.invalidate()
      onOpenChange(false)
      setName('')
      setError(null)
      router.push(`/groups/${data.slug}`)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  function validateName(value: string): string | null {
    if (value.trim().length < GROUP_NAME_MIN) {
      return 'Group name is required.'
    }
    if (value.trim().length > GROUP_NAME_MAX) {
      return `Group name must be ${GROUP_NAME_MAX} characters or less.`
    }
    return null
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationError = validateName(name)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    createGroup.mutate({ name: name.trim() })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName('')
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t('createGroup')}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createGroupTitle')}</DialogTitle>
          <DialogDescription>{t('createGroupDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="group-name">{t('groupNameLabel')}</Label>
            <Input
              id="group-name"
              placeholder="e.g. Household, Trip to Paris"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              maxLength={GROUP_NAME_MAX + 10}
              disabled={createGroup.isPending}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {name.trim().length}/{GROUP_NAME_MAX} {t('characters')}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createGroup.isPending}>
              {createGroup.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {t('createGroup')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
