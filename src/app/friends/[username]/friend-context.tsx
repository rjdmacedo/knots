'use client'

import { trpc } from '@/trpc/client'
import { createContext, PropsWithChildren, useContext } from 'react'

type FriendContextValue = {
  friendId: string | null
  username: string
  isLoading: boolean
}

const FriendContext = createContext<FriendContextValue | null>(null)

export function useFriendContext() {
  const context = useContext(FriendContext)
  if (!context)
    throw new Error(
      'Missing FriendContext. Should be called inside FriendContextProvider.',
    )
  return context
}

export function FriendContextProvider({
  username,
  children,
}: PropsWithChildren<{ username: string }>) {
  const { data, isLoading } = trpc.friends.getFriendByUsername.useQuery({
    username,
  })

  return (
    <FriendContext.Provider
      value={{
        friendId: data?.id ?? null,
        username,
        isLoading,
      }}
    >
      {children}
    </FriendContext.Provider>
  )
}
