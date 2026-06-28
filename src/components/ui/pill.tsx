import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface PillProps {
  label: string
  icon?: ReactNode
  className?: string
  onRemove?: () => void
}

export function Pill({ label, icon, className, onRemove }: PillProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto gap-1.5 rounded-md border-muted-foreground bg-inherit px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-inherit',
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 opacity-70 [&_svg]:size-3.5">{icon}</span>
      ) : null}
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Remove ${label}`}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </Badge>
  )
}
