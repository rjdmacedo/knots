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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trpc } from '@/trpc/client'
import { Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

export function GroupDangerZone({
  groupId,
  groupName,
  isOwner,
  isArchived,
}: {
  groupId: string
  groupName: string
  isOwner: boolean
  isArchived: boolean
}) {
  const t = useTranslations('GroupDangerZone')
  const router = useRouter()
  const utils = trpc.useUtils()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const invalidate = async () => {
    await utils.groupMembership.getUserGroups.invalidate()
    await utils.groups.invalidate()
  }

  const archiveGroup = trpc.groups.archive.useMutation({
    onSuccess: async () => {
      toast.success(t('archiveSuccess'))
      await invalidate()
      router.push('/groups')
    },
    onError: (error) => toast.error(error.message),
  })

  const unarchiveGroup = trpc.groups.unarchive.useMutation({
    onSuccess: async () => {
      toast.success(t('unarchiveSuccess'))
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: async () => {
      toast.success(t('deleteSuccess'))
      router.replace('/groups')
      await invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const isBusy =
    archiveGroup.isPending || unarchiveGroup.isPending || deleteGroup.isPending

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {isArchived ? (
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() => unarchiveGroup.mutate({ groupId })}
          >
            {unarchiveGroup.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArchiveRestore className="h-4 w-4 mr-2" />
            )}
            {t('unarchive')}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() => archiveGroup.mutate({ groupId })}
          >
            {archiveGroup.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Archive className="h-4 w-4 mr-2" />
            )}
            {t('archive')}
          </Button>
        )}

        {isOwner && (
          <>
            <Button
              variant="destructive"
              disabled={isBusy}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('delete')}
            </Button>

            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('deleteConfirmDescription', { name: groupName })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteGroup.isPending}>
                    {t('cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteGroup.isPending}
                    onClick={() => deleteGroup.mutate({ groupId })}
                  >
                    {deleteGroup.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {t('deleteConfirmAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  )
}
