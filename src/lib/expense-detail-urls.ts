export function getGroupExpenseDetailPath(groupId: string, expenseId: string) {
  return `/groups/${groupId}/expenses/${expenseId}`
}

export function getFriendExpenseDetailPath(
  username: string,
  expenseId: string,
  options?: { isPayment?: boolean },
) {
  if (options?.isPayment) {
    return `/friends/${username}/payments/${expenseId}`
  }
  return `/friends/${username}/expenses/${expenseId}`
}

export function isGroupExpenseDetailPath(pathname: string) {
  return /^\/groups\/[^/]+\/expenses\/[^/]+$/.test(pathname)
}

export function isFriendExpenseDetailPath(pathname: string) {
  return (
    /^\/friends\/[^/]+\/expenses\/[^/]+$/.test(pathname) ||
    /^\/friends\/[^/]+\/payments\/[^/]+$/.test(pathname)
  )
}
