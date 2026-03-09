import { cn } from '@/lib/utils'
import Image from 'next/image'

type KnotsLogoProps = {
  className?: string
}

export function KnotsLogo({ className }: KnotsLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Knots"
      width={40}
      height={40}
      className={cn('h-8 w-auto', className)}
      priority
    />
  )
}
