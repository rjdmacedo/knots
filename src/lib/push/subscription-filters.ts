import { ActivityType } from '@prisma/client'

export type PushSubscriptionPreferences = {
  subscriberUserId: string
  notifyAllMembers: boolean
  includedUserIds: string[]
  notifyOnCreate: boolean
  notifyOnUpdate: boolean
  notifyOnDelete: boolean
}

export function defaultPushPreferences(
  subscriberUserId: string,
): PushSubscriptionPreferences {
  return {
    subscriberUserId,
    notifyAllMembers: true,
    includedUserIds: [],
    notifyOnCreate: true,
    notifyOnUpdate: true,
    notifyOnDelete: true,
  }
}

export function isActivityTypeEnabled(
  activityType: ActivityType,
  prefs: Pick<
    PushSubscriptionPreferences,
    'notifyOnCreate' | 'notifyOnUpdate' | 'notifyOnDelete'
  >,
): boolean {
  switch (activityType) {
    case ActivityType.CREATE_EXPENSE:
      return prefs.notifyOnCreate
    case ActivityType.UPDATE_EXPENSE:
    case ActivityType.UPDATE_GROUP:
      return prefs.notifyOnUpdate
    case ActivityType.DELETE_EXPENSE:
      return prefs.notifyOnDelete
    default:
      return false
  }
}

/**
 * Whether a push should be sent for this subscription and activity.
 * Never notifies the subscriber about their own actions.
 */
export function isPushSubscriptionEligible(
  sub: PushSubscriptionPreferences,
  activityType: ActivityType,
  actorUserId: string | undefined,
): boolean {
  if (!actorUserId || actorUserId === sub.subscriberUserId) {
    return false
  }

  if (!sub.notifyAllMembers) {
    if (
      sub.includedUserIds.length === 0 ||
      !sub.includedUserIds.includes(actorUserId)
    ) {
      return false
    }
  }

  return isActivityTypeEnabled(activityType, sub)
}
