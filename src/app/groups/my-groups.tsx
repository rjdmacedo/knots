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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { trpc } from '@/trpc/client'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
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

type UserGroup = {
  id: string
  name: string
  createdAt: Date
  archivedAt: Date | null
  role: 'OWNER' | 'MEMBER'
}

export function MyGroups() {
  const t = useTranslations('MyGroups')
  const {
    data: groups,
    isLoading,
    error,
  } = trpc.groupMembership.getUserGroups.useQuery()

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
        <Button nativeButton={false} render={<Link href="/groups/create" />}>
          <Plus className="h-4 w-4 mr-2" />
          {t('createGroup')}
        </Button>
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
                    <GroupCard group={group} />
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
                    <GroupCard group={group} />
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

function GroupCard({ group }: { group: UserGroup }) {
  const t = useTranslations('MyGroups')
  const tGroups = useTranslations('Groups')
  const router = useRouter()
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const utils = trpc.useUtils()
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
          href={`/groups/${group.id}`}
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
