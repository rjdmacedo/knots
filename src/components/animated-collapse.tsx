'use client'

import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

const collapseTransition = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1] as const,
}

export const layoutTransition = {
  layout: {
    duration: 0.32,
    ease: [0.32, 0.72, 0, 1] as const,
  },
}

export function AnimatedCollapse({
  open,
  children,
  className,
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={collapseTransition}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function AnimatedLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      layout
      className={cn('min-w-0', className)}
      transition={layoutTransition}
    >
      {children}
    </motion.div>
  )
}
