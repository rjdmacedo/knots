'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tag, TagInput } from '@/components/ui/tag-input'
import { FriendListItem } from '@/lib/friends'
import { cn } from '@/lib/utils'
import { ChevronsUpDown, User, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

type ParticipantValue =
  | { kind: 'group'; group: { id: string; name: string } }
  | { kind: 'friend'; friend: FriendListItem }

type ExpenseParticipantPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userGroups: { id: string; name: string }[]
  friends: FriendListItem[]
  selectedGroup: { id: string; name: string } | null
  selectedFriends: FriendListItem[]
  onSelectGroup: (group: { id: string; name: string }) => void
  onSelectFriend: (friend: FriendListItem) => void
  onRemoveGroup: () => void
  onRemoveFriend: (friendId: string) => void
}

function ParticipantTagInput({
  userGroups,
  availableGroups,
  availableFriends,
  groupsLocked,
  selectedGroup,
  selectedFriends,
  onSelectGroup,
  onSelectFriend,
  onRemoveGroup,
  onRemoveFriend,
}: {
  userGroups: { id: string; name: string }[]
  availableGroups: { id: string; name: string }[]
  availableFriends: FriendListItem[]
  groupsLocked: boolean
  selectedGroup: { id: string; name: string } | null
  selectedFriends: FriendListItem[]
  onSelectGroup: (group: { id: string; name: string }) => void
  onSelectFriend: (friend: FriendListItem) => void
  onRemoveGroup: () => void
  onRemoveFriend: (friendId: string) => void
}) {
  const t = useTranslations('FloatingCreateExpense')

  const tags = useMemo<Tag<ParticipantValue>[]>(() => {
    const result: Tag<ParticipantValue>[] = []
    if (selectedGroup) {
      result.push({
        label: selectedGroup.name,
        value: { kind: 'group', group: selectedGroup },
      })
    }
    for (const friend of selectedFriends) {
      result.push({
        label: friend.name,
        value: { kind: 'friend', friend },
      })
    }
    return result
  }, [selectedGroup, selectedFriends])

  const suggestionGroups = useMemo(() => {
    const groups = []
    if (userGroups.length > 0) {
      groups.push({
        heading: t('groupsHeader'),
        tags: availableGroups.map((group) => ({
          label: group.name,
          value: { kind: 'group' as const, group },
        })),
        isDisabled: () => groupsLocked,
      })
    }
    if (availableFriends.length > 0) {
      groups.push({
        heading: t('friendsHeader'),
        tags: availableFriends.map((friend) => ({
          label: friend.name,
          value: { kind: 'friend' as const, friend },
        })),
      })
    }
    return groups
  }, [availableFriends, availableGroups, groupsLocked, t, userGroups.length])

  return (
    <TagInput
      tags={tags}
      setTags={() => {}}
      suggestionGroups={suggestionGroups}
      alwaysShowSuggestions
      placeholder={t('searchPlaceholder')}
      emptyMessage={t('noFriendOrGroupFound')}
      getTagSearchValue={(tag) => {
        if (tag.value.kind === 'friend') {
          return `${tag.value.friend.name} ${tag.value.friend.email}`
        }
        return tag.value.group.name
      }}
      onSelectTag={(tag) => {
        if (tag.value.kind === 'group') {
          onSelectGroup(tag.value.group)
        } else {
          onSelectFriend(tag.value.friend)
        }
      }}
      onRemoveTag={(tag) => {
        if (tag.value.kind === 'group') {
          onRemoveGroup()
        } else {
          onRemoveFriend(tag.value.friend.id)
        }
      }}
      onClearTags={() => {
        if (selectedGroup) {
          onRemoveGroup()
        }
        for (const friend of selectedFriends) {
          onRemoveFriend(friend.id)
        }
      }}
      getPillIcon={(tag) =>
        tag.value.kind === 'group' ? (
          <Users className="size-4" />
        ) : (
          <User className="size-4" />
        )
      }
      AllTagsLabel={({ value }) => {
        if (value.kind === 'friend') {
          return (
            <div className="flex w-full min-w-0 items-center justify-between gap-4">
              <span className="truncate font-medium">{value.friend.name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {value.friend.email}
              </span>
            </div>
          )
        }
        return <span className="truncate font-medium">{value.group.name}</span>
      }}
      className="px-4 py-3"
    />
  )
}

export function ExpenseParticipantPicker({
  open,
  onOpenChange,
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

  const availableGroups = useMemo(() => {
    if (!selectedGroup) return userGroups
    return userGroups.filter((g) => g.id !== selectedGroup.id)
  }, [userGroups, selectedGroup])

  const tagInput = (
    <ParticipantTagInput
      userGroups={userGroups}
      availableGroups={availableGroups}
      availableFriends={availableFriends}
      groupsLocked={!!selectedGroup}
      selectedGroup={selectedGroup}
      selectedFriends={selectedFriends}
      onSelectGroup={onSelectGroup}
      onSelectFriend={onSelectFriend}
      onRemoveGroup={onRemoveGroup}
      onRemoveFriend={onRemoveFriend}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-x-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t('pickerTitle')}</DialogTitle>
        </DialogHeader>
        {tagInput}
        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('pickerDone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        'h-9 w-full justify-between border-input font-normal shadow-xs',
        className,
      )}
    >
      {hasSelection ? (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left">
          {selectedGroup ? (
            <span className="flex min-w-0 max-w-full items-center gap-1.5">
              <Users className="size-4 shrink-0 opacity-50" />
              <span className="truncate">{selectedGroup.name}</span>
            </span>
          ) : null}
          {selectedFriends.map((friend, index) => (
            <span
              key={friend.id}
              className="flex min-w-0 max-w-full items-center gap-1.5"
            >
              {selectedGroup || index > 0 ? (
                <span className="text-muted-foreground">·</span>
              ) : null}
              <User className="size-4 shrink-0 opacity-50" />
              <span className="truncate">{friend.name}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="truncate text-left text-muted-foreground">
          {t('selectParticipants')}
        </span>
      )}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  )
}
