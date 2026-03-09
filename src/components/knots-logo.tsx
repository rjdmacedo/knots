import { cn } from '@/lib/utils'

type KnotsLogoProps = {
  className?: string
}

export function KnotsLogo({ className }: KnotsLogoProps) {
  return (
    <svg
      viewBox="8 6 40 22"
      aria-hidden="true"
      className={cn('h-8 w-auto', className)}
    >
      <defs>
        <linearGradient id="yarn-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      {/* yarn ball base */}
      <circle cx="20" cy="16" r="9" fill="url(#yarn-body)" />
      <circle
        cx="20"
        cy="16"
        r="9"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.18"
        strokeWidth="1.4"
      />

      {/* yarn strands */}
      <path
        d="M12 16c2.2-3.2 4.9-4.8 8-4.8 3.1 0 5.8 1.6 8 4.8"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.25"
        strokeWidth="1.1"
      />
      <path
        d="M12.5 18.5c2.1-2.7 4.5-4 7.5-4 3 0 5.4 1.3 7.5 4"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.3"
        strokeWidth="1.1"
      />
      <path
        d="M13 13.8c1.7-1.9 3.7-2.8 6.1-2.8 2.4 0 4.4.9 6.1 2.8"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.25"
        strokeWidth="1.1"
      />
      <path
        d="M15 10.7c1.3-.9 2.7-1.3 4.3-1.3 1.6 0 3 .4 4.3 1.3"
        fill="none"
        stroke="#0f172a"
        strokeOpacity="0.22"
        strokeWidth="1.1"
      />

      {/* loose yarn tail */}
      <path
        d="M27 19.5c2.4 1.2 4.4 1.8 6.2 1.8 2.5 0 4.2-.9 6.3-2.2 2-1.3 3.7-1.8 5.5-1.2"
        fill="none"
        stroke="url(#yarn-body)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
