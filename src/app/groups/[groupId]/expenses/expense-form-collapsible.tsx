'use client'

import { Button } from '@/components/ui/button'
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
  description?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  className?: string
}

export function ExpenseFormCollapsible({
  title,
  description,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
  className,
}: ExpenseFormCollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('rounded-lg border border-border', className)}
    >
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto min-h-11 w-full items-center justify-between gap-3 whitespace-normal rounded-lg px-4 py-3 font-medium hover:bg-muted/50"
          />
        }
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className="text-sm">{title}</span>
          {description ? (
            <span
              className={cn(
                'text-xs font-normal text-muted-foreground transition-opacity duration-200',
                open && 'opacity-0',
              )}
            >
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
