import {
  acceptFriendRequest,
  addFriendByEmail,
  declineFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  removeFriend,
} from '@/lib/friends'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const friendsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listFriends(ctx.user.id)
  }),

  listIncoming: protectedProcedure.query(async ({ ctx }) => {
    return listIncomingFriendRequests(ctx.user.id)
  }),

  add: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return addFriendByEmail({
        userId: ctx.user.id,
        email: input.email,
        name: input.name,
      })
    }),

  accept: protectedProcedure
    .input(z.object({ incomingFriendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return acceptFriendRequest({
        userId: ctx.user.id,
        incomingFriendId: input.incomingFriendId,
      })
    }),

  decline: protectedProcedure
    .input(z.object({ incomingFriendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await declineFriendRequest({
        userId: ctx.user.id,
        incomingFriendId: input.incomingFriendId,
      })

      return { success: true }
    }),

  remove: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await removeFriend({
        userId: ctx.user.id,
        friendId: input.friendId,
      })

      return { success: true }
    }),
})
