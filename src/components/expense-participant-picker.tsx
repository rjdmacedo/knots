'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { FriendListItem } from '@/lib/friends'
import { cn } from '@/lib/utils'
import { Command as CommandPrimitive } from 'cmdk'
import { ChevronsUpDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type ExpenseParticipantPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  isDesktop: boolean
  userGroups: { id: string; name: string }[]
  friends: FriendListItem[]
  selectedGroup: { id: string; name: string } | null
  selectedFriends: FriendListItem[]
  onSelectGroup: (group: { id: string; name: string }) => void
  onSelectFriend: (friend: FriendListItem) => void
  onRemoveGroup: () => void
  onRemoveFriend: (friendId: string) => void
}

function ParticipantPickerCommand({
  userGroups,
  availableFriends,
  selectedGroup,
  selectedFriends,
  onSelectGroup,
  onSelectFriend,
  onRemoveGroup,
  onRemoveFriend,
}: {
  userGroups: { id: string; name: string }[]
  availableFriends: FriendListItem[]
  selectedGroup: { id: string; name: string } | null
  selectedFriends: FriendListItem[]
  onSelectGroup: (group: { id: string; name: string }) => void
  onSelectFriend: (friend: FriendListItem) => void
  onRemoveGroup: () => void
  onRemoveFriend: (friendId: string) => void
}) {
  const t = useTranslations('FloatingCreateExpense')
  const [singleGroupAlertOpen, setSingleGroupAlertOpen] = useState(false)

  const handleSelectGroup = (group: { id: string; name: string }) => {
    if (selectedGroup && selectedGroup.id !== group.id) {
      setSingleGroupAlertOpen(true)
      return
    }
    if (selectedGroup?.id === group.id) {
      return
    }
    onSelectGroup(group)
  }

  return (
    <>
      <Command
        shouldFilter
        className="w-full min-w-0 overflow-hidden rounded-none border-x-0 border-y border-input bg-muted/20 p-0 sm:rounded-md sm:border-x"
      >
        <div className="flex flex-wrap items-center gap-1.5 p-2 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
          {selectedGroup && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={onRemoveGroup}
              className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
            >
              {t('selectGroupText', { name: selectedGroup.name })}
              <span className="text-primary/70">×</span>
            </Button>
          )}
          {selectedFriends.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => onRemoveFriend(f.id)}
              className="border-border"
            >
              {f.name}
              <span className="text-muted-foreground">×</span>
            </Button>
          ))}
          <CommandPrimitive.Input
            placeholder={
              selectedFriends.length === 0 && !selectedGroup
                ? t('searchPlaceholder')
                : ''
            }
            className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <CommandList className="max-h-64 border-t border-border">
          <CommandEmpty>{t('noFriendOrGroupFound')}</CommandEmpty>
          {userGroups.length > 0 && (
            <CommandGroup heading={t('groupsHeader')}>
              {userGroups.map((g) => (
                <CommandItem
                  key={g.id}
                  value={g.name}
                  onSelect={() => handleSelectGroup({ id: g.id, name: g.name })}
                  className="py-2.5"
                >
                  <span className="truncate">{g.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {availableFriends.length > 0 && (
            <CommandGroup heading={t('friendsHeader')}>
              {availableFriends.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`${f.name} ${f.email}`}
                  onSelect={() => onSelectFriend(f)}
                  className="items-start py-2.5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{f.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {f.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      <AlertDialog
        open={singleGroupAlertOpen}
        onOpenChange={setSingleGroupAlertOpen}
      >
        <AlertDialogContent nested>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('singleGroupAlertTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('singleGroupAlertDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t('singleGroupAlertOk')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ExpenseParticipantPicker({
  open,
  onOpenChange,
  isDesktop,
  userGroups,
  friends,
  selectedGroup,
  selectedFriends,
  onSelectGroup,
  onSelectFriend,
  onRemoveGroup,
  onRemoveFriend,
}: ExpenseParticipantPickerProps) {
  const t = useTranslations('FloatingCreateExpense')

  const availableFriends = useMemo(() => {
    const selectedIds = new Set(selectedFriends.map((sf) => sf.id))
    return friends.filter((f) => !selectedIds.has(f.id))
  }, [friends, selectedFriends])

  const command = (
    <ParticipantPickerCommand
      userGroups={userGroups}
      availableFriends={availableFriends}
      selectedGroup={selectedGroup}
      selectedFriends={selectedFriends}
      onSelectGroup={onSelectGroup}
      onSelectFriend={onSelectFriend}
      onRemoveGroup={onRemoveGroup}
      onRemoveFriend={onRemoveFriend}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          nested
          className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{t('pickerTitle')}</DialogTitle>
          </DialogHeader>
          {command}
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('pickerDone')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent nested className="max-h-[85vh] p-0">
        <DrawerHeader className="mb-0 border-b px-6 pb-3 pt-4 text-left">
          <DrawerTitle>{t('pickerTitle')}</DrawerTitle>
        </DrawerHeader>
        {command}
        <DrawerFooter className="px-6 pb-6">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('pickerDone')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function ExpenseParticipantTrigger({
  selectedGroup,
  selectedFriends,
  onClick,
  className,
}: {
  selectedGroup: { id: string; name: string } | null
  selectedFriends: FriendListItem[]
  onClick: () => void
  className?: string
}) {
  const t = useTranslations('FloatingCreateExpense')

  const hasSelection = !!selectedGroup || selectedFriends.length > 0

  const summary = useMemo(() => {
    if (!hasSelection) return t('selectParticipants')
    const parts: string[] = []
    if (selectedGroup) {
      parts.push(t('selectGroupText', { name: selectedGroup.name }))
    }
    if (selectedFriends.length > 0) {
      parts.push(selectedFriends.map((f) => f.name).join(', '))
    }
    return parts.join(' · ')
  }, [hasSelection, selectedGroup, selectedFriends, t])

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        'h-auto min-h-9 w-full justify-between py-2 font-normal',
        className,
      )}
    >
      <span
        className={cn(
          'truncate text-left',
          !hasSelection && 'text-muted-foreground',
        )}
      >
        {summary}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  )
}
