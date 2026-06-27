import { cn } from '@/lib/utils'

export function ParticipantAvatar({
  name,
  className,
  size = 'md',
}: {
  name: string | null | undefined
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const initials = getInitials(name)
  const sizeClass =
    size === 'sm'
      ? 'size-8 text-xs'
      : size === 'lg'
        ? 'size-12 text-base'
        : 'size-10 text-sm'

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary',
        sizeClass,
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  )
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
