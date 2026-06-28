'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { FriendListItem } from '@/lib/friends'
import { useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useIsClient } from 'foxact/use-is-client'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

export type FriendSelection = {
  userId?: string
  email: string
  name: string
}

type FriendPickerProps = {
  excludeUserIds?: string[]
  onSelect: (selection: FriendSelection) => void
  placeholder?: string
  disabled?: boolean
  value?: FriendSelection | null
  className?: string
}

function friendToSelection(friend: FriendListItem): FriendSelection {
  return {
    ...(friend.friendUserId ? { userId: friend.friendUserId } : {}),
    email: friend.email,
    name: friend.name,
  }
}

function selectionKey(selection: FriendSelection): string {
  return selection.userId ?? selection.email
}

export function FriendPicker({
  excludeUserIds = [],
  onSelect,
  placeholder,
  disabled,
  value,
  className,
}: FriendPickerProps) {
  const t = useTranslations('Friends')
  const [open, setOpen] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [emailSectionOpen, setEmailSectionOpen] = useState(false)
  const isClient = useIsClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const { data: friends = [], isLoading } = trpc.friends.list.useQuery()

  const excludeSet = useMemo(() => new Set(excludeUserIds), [excludeUserIds])

  const availableFriends = useMemo(
    () =>
      friends.filter(
        (friend) =>
          !friend.friendUserId || !excludeSet.has(friend.friendUserId),
      ),
    [friends, excludeSet],
  )

  const handleSelect = (selection: FriendSelection) => {
    onSelect(selection)
    setOpen(false)
    setManualEmail('')
    setEmailSectionOpen(false)
  }

  const handleManualEmail = () => {
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    handleSelect({
      email,
      name: email.split('@')[0],
    })
  }

  const resolvedPlaceholder = placeholder ?? t('pickerPlaceholder')

  const triggerLabel = value?.name ?? resolvedPlaceholder

  const command = (
    <FriendPickerCommand
      friends={availableFriends}
      isLoading={isLoading}
      selectedKey={value ? selectionKey(value) : undefined}
      manualEmail={manualEmail}
      onManualEmailChange={setManualEmail}
      emailSectionOpen={emailSectionOpen}
      onEmailSectionOpenChange={setEmailSectionOpen}
      onSelectFriend={(friend) => handleSelect(friendToSelection(friend))}
      onSubmitManualEmail={handleManualEmail}
      disabled={disabled}
    />
  )

  const trigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      disabled={disabled || isLoading}
      className={cn('w-full justify-between font-normal', className)}
    >
      <span className={cn('truncate', !value && 'text-muted-foreground')}>
        {triggerLabel}
      </span>
      {isLoading ? (
        <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
      ) : (
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      )}
    </Button>
  )

  if (!isClient || !isDesktop) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="p-0">
          <DrawerTitle className="sr-only">{t('pickerTitle')}</DrawerTitle>
          {command}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        {command}
      </PopoverContent>
    </Popover>
  )
}

function FriendPickerCommand({
  friends,
  isLoading,
  selectedKey,
  manualEmail,
  onManualEmailChange,
  emailSectionOpen,
  onEmailSectionOpenChange,
  onSelectFriend,
  onSubmitManualEmail,
  disabled,
}: {
  friends: FriendListItem[]
  isLoading: boolean
  selectedKey?: string
  manualEmail: string
  onManualEmailChange: (email: string) => void
  emailSectionOpen: boolean
  onEmailSectionOpenChange: (open: boolean) => void
  onSelectFriend: (friend: FriendListItem) => void
  onSubmitManualEmail: () => void
  disabled?: boolean
}) {
  const t = useTranslations('Friends')

  return (
    <Command shouldFilter>
      <CommandInput placeholder={t('pickerSearch')} className="text-base" />
      <CommandList>
        <CommandEmpty>
          {isLoading ? t('loading') : t('pickerEmpty')}
        </CommandEmpty>
        <CommandGroup>
          {friends.map((friend) => {
            const key = friend.friendUserId ?? friend.email
            return (
              <CommandItem
                key={friend.id}
                value={`${friend.name} ${friend.email}`}
                disabled={disabled}
                onSelect={() => onSelectFriend(friend)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4 shrink-0',
                    selectedKey === key ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{friend.name}</span>
                    {!friend.hasAccount && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {t('pickerInvited')}
                      </Badge>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {friend.email}
                  </span>
                </div>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
      <div className="border-t p-2">
        <Collapsible
          open={emailSectionOpen}
          onOpenChange={onEmailSectionOpenChange}
        >
          <CollapsibleTrigger
            render={<Button variant="link" size="sm" className="h-auto px-0" />}
          >
            {t('addByEmail')}
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Input
              type="email"
              placeholder={t('emailPlaceholder')}
              value={manualEmail}
              onChange={(event) => onManualEmailChange(event.target.value)}
              disabled={disabled}
              className="text-base"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSubmitManualEmail()
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={disabled || !manualEmail.trim().includes('@')}
              onClick={onSubmitManualEmail}
            >
              {t('useEmail')}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Command>
  )
}
