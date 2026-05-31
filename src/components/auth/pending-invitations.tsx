'use client'

import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/client'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

interface PendingInvitationsProps {
  groupId: string
}

/**
 * Displays a list of pending invitations for a group with revoke actions.
 * Each invitation shows the invited email and expiry date.
 * Requirement 5.7: Group members can view and revoke pending invitations.
 */
export function PendingInvitations({ groupId }: PendingInvitationsProps) {
  const utils = trpc.useUtils()

  const { data: invitations, isLoading } =
    trpc.groupMembership.getPendingInvitations.useQuery({ groupId })

  const revokeInvitation = trpc.groupMembership.revokeInvitation.useMutation({
    onSuccess: () => {
      toast.success('Invitation revoked.')
      utils.groupMembership.getPendingInvitations.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invitations || invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No pending invitations.
      </p>
    )
  }

  return (
    <ul
      className="flex flex-col gap-2"
      role="list"
      aria-label="Pending invitations"
    >
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium truncate">
              {invitation.email}
            </span>
            <span className="text-xs text-muted-foreground">
              Expires{' '}
              {new Date(invitation.expiresAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              revokeInvitation.mutate({ invitationId: invitation.id })
            }
            disabled={revokeInvitation.isPending}
            aria-label={`Revoke invitation for ${invitation.email}`}
          >
            {revokeInvitation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </Button>
        </li>
      ))}
    </ul>
  )
}
