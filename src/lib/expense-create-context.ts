export type ExpenseCreateContext =
  | { type: 'friend'; username: string }
  | { type: 'group'; groupId: string }

/** Derives default participant selection from the current route. */
export function parseExpenseCreateContext(
  pathname: string,
): ExpenseCreateContext | null {
  const groupMatch = pathname.match(/^\/groups\/([^/]+)/)
  if (groupMatch?.[1]) {
    return { type: 'group', groupId: groupMatch[1] }
  }

  const friendMatch = pathname.match(/^\/friends\/([^/]+)/)
  if (friendMatch?.[1]) {
    return { type: 'friend', username: friendMatch[1] }
  }

  return null
}
