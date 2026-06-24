'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PropsWithChildren, ReactNode } from 'react'

export function DetailPageLayout({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-6">{children}</div>
}

type DetailPageHeaderProps = {
  backHref: string
  backLabel: string
  title: ReactNode
  description?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
}

export function DetailPageHeader({
  backHref,
  backLabel,
  title,
  description,
  summary,
  actions,
  tabs,
}: DetailPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={backHref}
        className="text-sm text-muted-foreground hover:underline w-fit"
      >
        ← {backLabel}
      </Link>

      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-2xl">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-1 shrink-0">{actions}</div>
          ) : null}
        </div>
        {summary ? <div className="mt-2">{summary}</div> : null}
      </div>

      {tabs}
    </div>
  )
}

export type DetailPageTab = {
  value: string
  label: ReactNode
}

type DetailPageTabsProps = {
  basePath: string
  tabs: DetailPageTab[]
}

export function DetailPageTabs({ basePath, tabs }: DetailPageTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const escapedBasePath = basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const value =
    pathname.replace(new RegExp(`${escapedBasePath}/([^/]+).*`), '$1') ||
    tabs[0]?.value ||
    ''

  return (
    <Tabs
      value={value}
      className="min-w-0"
      onValueChange={(nextValue) => {
        router.push(`${basePath}/${nextValue}`)
      }}
    >
      <TabsList className="!max-w-full justify-start overflow-x-auto scrollbar-none border">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
