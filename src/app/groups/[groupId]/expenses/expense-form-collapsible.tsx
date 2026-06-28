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
  children: ReactNode
  className?: string
  description?: ReactNode
  defaultOpen?: boolean
}

/**
 * A collapsible component for wrapping an expense form with a title and description.
 * Allows toggling visibility of the content and accepts child components.
 *
 * @param {Object} props - The property object.
 * @param props.title - The title of the collapsible section, displayed in the trigger button.
 * @param props.children - The content to be displayed inside the collapsible when expanded.
 * @param props.className - Additional CSS class names for styling the collapsible container.
 * @param props.description - An optional description for the collapsible content.
 * @param props.defaultOpen=false - Determines whether the collapsible is open by default.
 * @return Returns a collapsible UI component containing the provided title, description, and children.
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
