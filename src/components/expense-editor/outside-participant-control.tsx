'use client'

import {
  ExpenseParticipantPicker,
  ExpenseParticipantTrigger,
} from '@/components/expense-participant-picker'
import { Label } from '@/components/ui/label'
import { addableOutsideFriends } from '@/lib/expense-editor-participants'
import { FriendListItem } from '@/lib/friends'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type GroupRef = {
  id: string
  name: string
}

type GroupMember = {
  id: string
}

type OutsideParticipantControlProps = {
  /** Every friend of the current user, before member filtering. */
  friends: FriendListItem[]
  /**
   * People already covered by the selected group. They are not offered again
   * as extra friends.
   */
  groupMembers: GroupMember[]
  /** Groups the user can pick. Ignored while `groupLocked` is set. */
  userGroups: GroupRef[]
  selectedGroup: GroupRef | null
  selectedFriends: FriendListItem[]
  /**
   * Group context: the group stays selected and cannot be removed or replaced.
   * Extra friends can still be added.
   */
  groupLocked?: boolean
  onSelectGroup: (group: GroupRef) => void
  onRemoveGroup: () => void
  onSelectFriend: (friend: FriendListItem) => void
  onRemoveFriend: (friendId: string) => void
}

/**
 * "With you and" control for creating an expense.
 *
 * At most one group. Friends who are not already in that group can be added
 * freely. When `groupLocked` is set, the group comes from the current page
 * and cannot be changed.
 */
export function OutsideParticipantControl({
  friends,
  groupMembers,
  userGroups,
  selectedGroup,
  selectedFriends,
  groupLocked = false,
  onSelectGroup,
  onRemoveGroup,
  onSelectFriend,
  onRemoveFriend,
}: OutsideParticipantControlProps) {
  const t = useTranslations('FloatingCreateExpense')
  const [pickerOpen, setPickerOpen] = useState(false)

  const offerableFriends = useMemo(
    () => addableOutsideFriends(friends, groupMembers),
    [friends, groupMembers],
  )

  return (
    <div className="flex flex-col gap-2 pt-3">
      <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {t('withWho')}
      </Label>
      <ExpenseParticipantTrigger
        selectedGroup={selectedGroup}
        selectedFriends={selectedFriends}
        onClick={() => setPickerOpen(true)}
      />
      <ExpenseParticipantPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        userGroups={groupLocked ? [] : userGroups}
        friends={offerableFriends}
        selectedGroup={selectedGroup}
        selectedFriends={selectedFriends}
        groupLocked={groupLocked}
        onSelectGroup={groupLocked ? () => {} : onSelectGroup}
        onSelectFriend={onSelectFriend}
        onRemoveGroup={groupLocked ? () => {} : onRemoveGroup}
        onRemoveFriend={onRemoveFriend}
      />
    </div>
  )
}
