'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/trpc/client'
import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface InviteFormProps {
  groupId: string
}

/**
 * Form component for inviting a user to a group by email.
 * Validates email format and calls the createInvitation tRPC mutation.
 * Handles DUPLICATE_PENDING and GROUP_LIMIT_REACHED errors.
 */
export function InviteForm({ groupId }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const utils = trpc.useUtils()

  const createInvitation = trpc.groupMembership.createInvitation.useMutation({
    onSuccess: () => {
      toast.success('Invitation sent successfully.')
      setEmail('')
      utils.groupMembership.getPendingInvitations.invalidate({ groupId })
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail) return

    // Basic email format check before sending to server
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('Please enter a valid email address.')
      return
    }

    createInvitation.mutate({ groupId, email: trimmedEmail })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Label htmlFor="invite-email">Invite by email</Label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          type="email"
          placeholder="colleague@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={createInvitation.isPending}
          className="text-base flex-1"
          required
        />
        <Button
          type="submit"
          disabled={createInvitation.isPending || !email.trim()}
          size="default"
        >
          {createInvitation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="sr-only">Send invitation</span>
        </Button>
      </div>
    </form>
  )
}
