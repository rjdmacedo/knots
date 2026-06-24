import type { trpc } from '@/trpc/client'

type TrpcUtils = ReturnType<typeof trpc.useUtils>

/** Keeps group and global activity feeds in sync after mutations. */
export function invalidateActivityQueries(utils: TrpcUtils) {
  void utils.activities.list.invalidate()
  void utils.groups.activities.invalidate()
}
