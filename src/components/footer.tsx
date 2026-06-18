'use client'

import { buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollText } from 'lucide-react'
import Link from 'next/link'
import packageJson from '../../package.json'

export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/50 backdrop-blur-xs z-50">
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
    </footer>
  )
}
