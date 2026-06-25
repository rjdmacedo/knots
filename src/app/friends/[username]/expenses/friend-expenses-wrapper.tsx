'use client'

import { useFriendContext } from '@/app/friends/[username]/friend-context'
import { Loader2 } from 'lucide-react'
import { FriendExpenses } from './friend-expenses'

export function FriendExpensesWrapper() {
  const { friendId, isLoading } = useFriendContext()

  if (isLoading || !friendId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return <FriendExpenses friendId={friendId} />
}
