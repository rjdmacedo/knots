'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { trpc } from '@/trpc/client'
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface InviteAcceptanceClientProps {
  invitationId: string
  userEmail: string
}

/**
 * Client component for accepting a group invitation.
 * Shows the user's email and prompts them to confirm acceptance.
 * Handles errors: EMAIL_MISMATCH, ALREADY_ACCEPTED, EXPIRED, REVOKED, ALREADY_MEMBER, GROUP_LIMIT_REACHED
 *
 * Requirements: 5.2, 5.3, 5.4, 5.6, 5.8, 5.10
 */
export function InviteAcceptanceClient({
  invitationId,
  userEmail,
}: InviteAcceptanceClientProps) {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)

  const acceptInvitation = trpc.groupMembership.acceptInvitation.useMutation({
    onSuccess: () => {
      setAccepted(true)
    },
  })

  const handleAccept = () => {
    acceptInvitation.mutate({ invitationId })
  }

  // Success state
  if (accepted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Invitation Accepted
          </CardTitle>
          <CardDescription>
            You have successfully joined the group.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => router.push('/groups')} className="w-full">
            Go to Groups
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Error state
  if (acceptInvitation.isError) {
    const errorMessage = acceptInvitation.error.message
    const errorInfo = getErrorInfo(errorMessage)

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Cannot Accept Invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{errorInfo.title}</AlertTitle>
            <AlertDescription>{errorInfo.description}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() => router.push('/groups')}
            className="w-full"
          >
            Go to Groups
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Default: prompt to accept
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Group Invitation
        </CardTitle>
        <CardDescription>
          You have been invited to join a group. Confirm your email to accept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border px-3 py-2 bg-muted/50">
          <p className="text-sm text-muted-foreground">Your email</p>
          <p className="text-sm font-medium">{userEmail}</p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button
          onClick={handleAccept}
          disabled={acceptInvitation.isPending}
          className="w-full"
        >
          {acceptInvitation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Accepting...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Accept Invitation
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push('/groups')}
          className="w-full"
        >
          Cancel
        </Button>
      </CardFooter>
    </Card>
  )
}

/**
 * Maps error messages from the tRPC router to user-friendly titles and descriptions.
 */
function getErrorInfo(message: string): {
  title: string
  description: string
} {
  if (message.includes('different email')) {
    return {
      title: 'Email Mismatch',
      description:
        'This invitation was sent to a different email address. Please log in with the correct account.',
    }
  }
  if (message.includes('already been accepted')) {
    return {
      title: 'Already Accepted',
      description: 'This invitation has already been used by someone.',
    }
  }
  if (message.includes('expired')) {
    return {
      title: 'Invitation Expired',
      description:
        'This invitation has expired. Please ask the group member to send a new one.',
    }
  }
  if (message.includes('revoked')) {
    return {
      title: 'Invitation Revoked',
      description: 'This invitation has been revoked by a group member.',
    }
  }
  if (message.includes('already a member')) {
    return {
      title: 'Already a Member',
      description: 'You are already a member of this group.',
    }
  }
  if (message.includes('maximum number of groups')) {
    return {
      title: 'Group Limit Reached',
      description:
        'You have reached the maximum number of groups (100). Please leave a group before joining a new one.',
    }
  }
  return {
    title: 'Error',
    description: message,
  }
}
