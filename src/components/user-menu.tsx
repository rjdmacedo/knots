'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logoutAction } from '@/lib/auth/actions'
import { LogOut, Settings, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useTransition } from 'react'

interface UserMenuProps {
  name?: string | null
  email?: string | null
}

export function UserMenu({ name, email }: UserMenuProps) {
  const t = useTranslations('UserMenu')
  const [isPending, startTransition] = useTransition()

  if (!name && !email) return null

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8" />
        }
      >
        <User className="h-4 w-4" />
        <span className="sr-only">User menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            {name && <span className="text-sm font-medium">{name}</span>}
            {email && (
              <span className="text-xs text-muted-foreground font-normal">
                {email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="h-4 w-4 mr-2" />
          {t('profileSettings')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} disabled={isPending}>
          <LogOut className="h-4 w-4 mr-2" />
          {isPending ? t('signingOut') : t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
