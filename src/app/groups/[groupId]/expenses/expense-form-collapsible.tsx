'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { ReactNode, useState } from 'react'

type ExpenseFormCollapsibleProps = {
  title: ReactNode
  children: ReactNode
  className?: string
  description?: ReactNode
  defaultOpen?: boolean
}

/**
 * Compact bordered collapsible used for Notes / Attach documents.
 */
export function ExpenseFormCollapsible({
  title,
  children,
  className,
  description,
  defaultOpen = false,
}: ExpenseFormCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-md border border-border data-open:bg-background',
        className,
      )}
    >
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" className="w-full" />}
      >
        {title}
        <ChevronDown className="ml-auto transition-transform group-data-panel-open/button:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex w-full min-w-0 flex-col items-stretch gap-2 p-2.5 pt-0 text-sm">
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
        <div className="w-full min-w-0">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

type ExpenseFormCardCollapsibleProps = {
  title: ReactNode
  description?: ReactNode
  /** Controlled open state. Ignored when `disabled`. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional controls rendered next to the title (outside the expand trigger). */
  headerAction?: ReactNode
  /** When true, the section stays collapsed and the expand trigger is inert. */
  disabled?: boolean
  children: ReactNode
  className?: string
}

/**
 * Card-styled collapsible for Paid by / Items / Split between sections.
 * Header action (e.g. Select none, Leave itemized) stays outside the trigger
 * so clicks don't toggle expand/collapse.
 */
export function ExpenseFormCardCollapsible({
  title,
  description,
  open,
  onOpenChange,
  headerAction,
  disabled = false,
  children,
  className,
}: ExpenseFormCardCollapsibleProps) {
  const isOpen = disabled ? false : open

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={disabled ? undefined : onOpenChange}
    >
      <Card
        className={cn('gap-4 py-0 shadow-none ring-0', className)}
        data-state={isOpen ? 'open' : 'closed'}
        data-disabled={disabled ? '' : undefined}
      >
        <CardHeader className="px-4 pt-4 group-data-[state=closed]/card:pb-4">
          <div className="flex items-start gap-2">
            <CollapsibleTrigger
              type="button"
              disabled={disabled}
              className={cn(
                'group/section-trigger flex min-w-0 flex-1 flex-col items-stretch gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <span className="min-w-0 flex-1">{title}</span>
                {!disabled ? (
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                ) : null}
              </CardTitle>
              {description ? (
                <CardDescription className="text-xs md:text-sm">
                  {description}
                </CardDescription>
              ) : null}
            </CollapsibleTrigger>
            {headerAction ? (
              <div className="flex shrink-0 items-center pt-0.5">
                {headerAction}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
