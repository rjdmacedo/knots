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
      className={cn('rounded-md data-open:bg-muted', className)}
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
