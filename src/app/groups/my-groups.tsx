'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { trpc } from '@/trpc/client'
import { AlertCircle, Loader2, Plus, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const GROUP_NAME_MIN = 1
const GROUP_NAME_MAX = 100

export function MyGroups() {
  const {
    data: groups,
    isLoading,
    error,
  } = trpc.groupMembership.getUserGroups.useQuery()
  const [dialogOpen, setDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <MyGroupsLayout>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading your groups…</span>
        </div>
      </MyGroupsLayout>
    )
  }

  if (error) {
    return (
      <MyGroupsLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load groups. Please try again later.
          </AlertDescription>
        </Alert>
      </MyGroupsLayout>
    )
  }

  return (
    <MyGroupsLayout
      action={
        <CreateGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      }
    >
      {groups && groups.length === 0 ? (
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>You are not a member of any groups yet.</p>
          <p>Create a group to start splitting expenses with others.</p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {groups?.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent"
              >
                <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{group.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MyGroupsLayout>
  )
}

function MyGroupsLayout({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-bold text-2xl">My Groups</h1>
        {action}
      </div>
      <div>{children}</div>
    </>
  )
}

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const utils = trpc.useUtils()

  const createGroup = trpc.groupMembership.createGroup.useMutation({
    onSuccess: async (data) => {
      await utils.groupMembership.getUserGroups.invalidate()
      onOpenChange(false)
      setName('')
      setError(null)
      router.push(`/groups/${data.groupId}`)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  function validateName(value: string): string | null {
    if (value.trim().length < GROUP_NAME_MIN) {
      return 'Group name is required.'
    }
    if (value.trim().length > GROUP_NAME_MAX) {
      return `Group name must be ${GROUP_NAME_MAX} characters or less.`
    }
    return null
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const validationError = validateName(name)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    createGroup.mutate({ name: name.trim() })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName('')
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new group</DialogTitle>
          <DialogDescription>
            Enter a name for your group. You can invite members after creating
            it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              placeholder="e.g. Household, Trip to Paris"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              maxLength={GROUP_NAME_MAX + 10}
              disabled={createGroup.isPending}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {name.trim().length}/{GROUP_NAME_MAX} characters
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createGroup.isPending}>
              {createGroup.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Create Group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
