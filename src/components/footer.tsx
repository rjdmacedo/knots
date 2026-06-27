'use client'

import { buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useScrollAtTop } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { ScrollText } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import packageJson from '../../package.json'

const footerTransition = {
  duration: 0.3,
  ease: [0.32, 0.72, 0, 1] as const,
}

export function Footer() {
  const isAtTop = useScrollAtTop()

  return (
    <motion.footer
      initial={false}
      animate={{
        y: isAtTop ? 0 : '100%',
        opacity: isAtTop ? 1 : 0,
      }}
      transition={footerTransition}
      className={cn(
        'fixed bottom-0 left-0 right-0 border-t border-border bg-background/50 backdrop-blur-xs z-50',
        !isAtTop && 'pointer-events-none',
      )}
      aria-hidden={!isAtTop}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Version {packageJson.version}</span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href="/changelog"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'icon-sm',
                  })}
                />
              }
            >
              <ScrollText className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>Changelog</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.footer>
  )
}
