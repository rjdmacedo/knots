/**
 * Pure helpers for the shared group-expense Editor.
 *
 * These functions contain the input-varying logic that the Editor relies on:
 * whether the form runs in payment (reimbursement) mode, which friends may be
 * added as outside participants, and the final participant list used for item
 * assignment and the paid-for list. They render nothing and hold no state so
 * they can be exercised directly by property tests.
 *
 * Id resolution is consistent throughout: a friend's identity is
 * `friendUserId ?? id`, matching how `FloatingCreateExpense` maps selected
 * friends onto expense participants today.
 */

/** Minimal shape of a friend from `FriendListItem`. */
type FriendLike = {
  id: string
  name: string
  email?: string | null
  friendUserId?: string | null
}

/** Minimal shape of a group member / current user participant. */
type MemberLike = {
  id: string
  name?: string | null
  email?: string | null
}

/** A participant in the editor's derived list. */
export type EditorParticipant = {
  id: string
  name: string
  email: string | null
}

/**
 * The Editor runs in payment (reimbursement) mode when either the loaded
 * expense or the create prefill is flagged as a reimbursement.
 *
 * @returns `true` iff at least one flag is `true`.
 */
export function isPaymentMode(flags: {
  expenseIsReimbursement?: boolean
  prefillIsReimbursement?: boolean
}): boolean {
  return (
    flags.expenseIsReimbursement === true ||
    flags.prefillIsReimbursement === true
  )
}

/** Resolve a friend's identity the same way the dialog does. */
function resolveFriendId(friend: FriendLike): string {
  return friend.friendUserId ?? friend.id
}

/**
 * Friends the Outside_Participant_Control may offer: every friend whose
 * resolved id is not already a member of the URL group.
 *
 * @returns the subset of `friends` that are not group members.
 */
export function addableOutsideFriends<T extends FriendLike>(
  friends: readonly T[],
  groupMembers: readonly MemberLike[],
): T[] {
  const memberIds = new Set(groupMembers.map((member) => member.id))
  return friends.filter((friend) => !memberIds.has(resolveFriendId(friend)))
}

/**
 * The Editor's derived participant set: the current user together with all
 * group members and exactly the added outside friends, deduplicated by
 * resolved id. A group member is never dropped, and no friend that is neither
 * a group member nor an added outside friend is ever included. With no outside
 * friends added, the result is just the current user and the group members.
 */
export function deriveEditorParticipants(input: {
  currentUser: MemberLike
  groupMembers: readonly MemberLike[]
  addedOutsideFriends: readonly FriendLike[]
}): EditorParticipant[] {
  const { currentUser, groupMembers, addedOutsideFriends } = input
  const byId = new Map<string, EditorParticipant>()

  const put = (id: string, name: string, email: string | null) => {
    if (!byId.has(id)) {
      byId.set(id, { id, name, email })
    }
  }

  put(
    currentUser.id,
    currentUser.name?.trim() || currentUser.id,
    currentUser.email ?? null,
  )

  for (const member of groupMembers) {
    put(member.id, member.name?.trim() || member.id, member.email ?? null)
  }

  for (const friend of addedOutsideFriends) {
    const id = resolveFriendId(friend)
    put(id, friend.name?.trim() || id, friend.email ?? null)
  }

  return Array.from(byId.values())
}
