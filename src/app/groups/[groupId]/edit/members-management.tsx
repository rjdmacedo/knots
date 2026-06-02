'use client'

import { FriendPicker } from '@/components/friend-picker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { trpc } from '@/trpc/client'
import {
  Crown,
  LogOut,
  MoreVertical,
  Plus,
  ShieldMinus,
  ShieldPlus,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

type Member = {
  id: string
  name: string
  email: string
  role: string
}

type Props = {
  groupId: string
  members: Member[]
  currentUserId: string
}

export function MembersManagement({ groupId, members, currentUserId }: Props) {
  const t = useTranslations('Members')
  const tGroup = useTranslations('GroupForm')
  const [isAdding, setIsAdding] = useState(false)
  const utils = trpc.useUtils()
  const router = useRouter()

  const currentUserRole = members.find((m) => m.id === currentUserId)?.role
  const isOwner = currentUserRole === 'OWNER'

  const addMember = trpc.groups.members.add.useMutation({
    onSuccess: (data) => {
      toast.success(t('addedToGroup', { name: data.name }))
      setIsAdding(false)
      utils.groups.getDetails.invalidate({ groupId })
      utils.groups.get.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const removeMember = trpc.groups.members.remove.useMutation({
    onSuccess: () => {
      toast.success(t('memberRemoved'))
      utils.groups.getDetails.invalidate({ groupId })
      utils.groups.get.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const leaveGroup = trpc.groups.members.leave.useMutation({
    onSuccess: () => {
      toast.success(t('youLeftGroup'))
      router.push('/groups')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const promoteMember = trpc.groups.members.promote.useMutation({
    onSuccess: () => {
      toast.success(t('memberPromoted'))
      utils.groups.getDetails.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const demoteMember = trpc.groups.members.demote.useMutation({
    onSuccess: () => {
      toast.success(t('memberDemoted'))
      utils.groups.getDetails.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handlePickFriend = (selection: {
    userId?: string
    email: string
    name: string
  }) => {
    addMember.mutate({
      groupId,
      ...(selection.userId
        ? { userId: selection.userId }
        : { email: selection.email }),
      name: selection.name,
    })
  }

  // Sort members: owners first, then alphabetically
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === 'OWNER' && b.role !== 'OWNER') return -1
    if (a.role !== 'OWNER' && b.role === 'OWNER') return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{tGroup('Participants.title')}</CardTitle>
        <CardDescription>{tGroup('Participants.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {sortedMembers.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                  {member.name.charAt(0).toUpperCase()}
                  {member.role === 'OWNER' && (
                    <Crown className="absolute -top-1 -right-1 h-3 w-3 text-amber-500" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {member.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {member.email}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Leave button on the current user's own row */}
                {member.id === currentUserId && (
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <LogOut className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{t('leaveGroup')}</TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('leaveGroup')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('leaveGroupDescription')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => leaveGroup.mutate({ groupId })}
                        >
                          {t('leave')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Owner can manage others via dropdown */}
                {isOwner && member.id !== currentUserId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {member.role !== 'OWNER' ? (
                        <DropdownMenuItem
                          onClick={() =>
                            promoteMember.mutate({
                              groupId,
                              userId: member.id,
                            })
                          }
                        >
                          <ShieldPlus className="h-4 w-4 mr-2" />
                          {t('promoteToOwner')}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            demoteMember.mutate({
                              groupId,
                              userId: member.id,
                            })
                          }
                        >
                          <ShieldMinus className="h-4 w-4 mr-2" />
                          {t('demoteToMember')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() =>
                          removeMember.mutate({
                            groupId,
                            userId: member.id,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('removeFromGroup')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Add member form — only visible to owner */}
        {isOwner && (
          <div>
            {isAdding ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {t('pickFriend')}
                </p>
                <FriendPicker
                  excludeUserIds={members.map((member) => member.id)}
                  onSelect={handlePickFriend}
                  disabled={addMember.isPending}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setIsAdding(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdding(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('addMember')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
