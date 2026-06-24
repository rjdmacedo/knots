'use client'

import { KnotsLogo } from '@/components/knots-logo'
import { buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'
import { History, LayoutGrid, Users, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AppHeaderProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
}

const navItems: {
  href: string
  labelKey: 'friends' | 'groups' | 'activities'
  icon: LucideIcon
}[] = [
  { href: '/friends', labelKey: 'friends', icon: Users },
  { href: '/groups', labelKey: 'groups', icon: LayoutGrid },
  { href: '/activities', labelKey: 'activities', icon: History },
]

function isNavActive(pathname: string, href: string) {
  if (href === '/groups') {
    return pathname === '/groups' || pathname.startsWith('/groups/')
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppHeader({
  isAuthenticated,
  userName,
  userEmail,
}: AppHeaderProps) {
  const t = useTranslations('Header')
  const pathname = usePathname()
  const logoHref = isAuthenticated ? '/groups' : '/'

  return (
    <header className="flex items-center fixed top-0 left-0 right-0 h-16 bg-background/50 border-b backdrop-blur-xs z-50">
      <div className="container flex justify-between">
        <Link
          className="flex items-center gap-2 hover:scale-105 transition-transform"
          href={logoHref}
        >
          <span className="flex items-center">
            <KnotsLogo />
            <span className="ml-2 font-semibold text-xl tracking-tight">
              Knots
            </span>
          </span>
        </Link>
        {isAuthenticated && (
          <nav aria-label={t('navLabel')}>
            <ul className="flex items-center gap-0.5 sm:gap-1">
              {navItems.map(({ href, labelKey, icon: Icon }) => {
                const label = t(labelKey)
                const active = isNavActive(pathname, href)

                return (
                  <li key={href}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link
                            href={href}
                            aria-label={label}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              buttonVariants({
                                variant: 'ghost',
                                size: 'icon-lg',
                              }),
                              'md:h-8 md:w-auto md:px-3 md:gap-1.5',
                              active && 'bg-accent text-accent-foreground',
                            )}
                          />
                        }
                      >
                        <Icon className="size-5 md:size-4" />
                        <span className="hidden md:inline">{label}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="md:hidden">
                        {label}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                )
              })}
              <li>
                <UserMenu name={userName} email={userEmail} />
              </li>
            </ul>
          </nav>
        )}
      </div>
    </header>
  )
}
