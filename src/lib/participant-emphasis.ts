import { cn } from '@/lib/utils'

export function participantEmphasisClassName(
  participantId: string,
  emphasizedParticipantIds?: string[],
) {
  if (!emphasizedParticipantIds) return undefined

  return emphasizedParticipantIds.includes(participantId)
    ? undefined
    : 'opacity-50'
}

export function participantRowClassName(
  participantId: string,
  emphasizedParticipantIds?: string[],
) {
  return cn(
    participantEmphasisClassName(participantId, emphasizedParticipantIds),
  )
}
