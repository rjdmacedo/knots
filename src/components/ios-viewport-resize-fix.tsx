'use client'

import { useEffect, useRef } from 'react'

/**
 * iOS PWA Viewport Resize Fix
 *
 * Problem: In iOS Safari and standalone PWA mode, when the virtual keyboard
 * closes after focusing an input inside a scrollable container, the
 * scroll container (flex-1 overflow-y-auto) does not correctly reclaim
 * its full height. The result is a "shrunken" viewport with a large
 * empty/black area between content and the fixed footer.
 *
 * Solution: This component wraps the scroll container and listens to
 * window.visualViewport 'resize' events. When the keyboard closes
 * (viewport height returns close to window.innerHeight), it forces
 * a height recalculation by briefly toggling the container's overflow
 * property, which triggers a re-layout in WebKit.
 *
 * This only activates on iOS devices and is a no-op on other platforms.
 */
export function IosViewportResizeFix({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Only run on iOS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

    if (!isIOS) return

    const viewport = window.visualViewport
    if (!viewport) return

    let lastViewportHeight = viewport.height
    let rafId: number | null = null

    const handleResize = () => {
      const currentHeight = viewport.height

      // Detect keyboard closing: viewport height increases significantly
      // (keyboard was open → now closed)
      const heightIncreased = currentHeight > lastViewportHeight + 50

      lastViewportHeight = currentHeight

      if (!heightIncreased) return

      // Debounce with rAF to batch the re-layout
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return

        // Force WebKit to recalculate the flex layout by toggling overflow.
        // This is the lightest repaint trigger that fixes the stale height.
        container.style.overflow = 'hidden'
        // Reading offsetHeight forces a synchronous reflow
        void container.offsetHeight
        container.style.overflow = ''

        // Also scroll to current position to reset any visual offset
        window.scrollTo(0, 0)
      })
    }

    viewport.addEventListener('resize', handleResize)

    return () => {
      viewport.removeEventListener('resize', handleResize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}
