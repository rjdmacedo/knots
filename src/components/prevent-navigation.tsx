'use client'

import { LeavingDialog } from '@/components/leaving-dialog'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type PreventNavigationProps = {
  backHref?: string
  description?: string
  isDirty: boolean
  resetData: () => void | Promise<void>
  title?: string
}

export function PreventNavigation({
  isDirty,
  backHref = '/',
  resetData,
  title,
  description,
}: PreventNavigationProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const pushedHistoryRef = useRef(false)
  const navigatingRef = useRef(false)

  // Ensure a history state exists so popstate triggers on back
  useEffect(() => {
    if (!isDirty) return
    if (typeof window === 'undefined') return
    if (pushedHistoryRef.current) return
    window.history.pushState(null, document.title, window.location.href)
    pushedHistoryRef.current = true
  }, [isDirty])

  // Intercept link clicks and browser navigation
  useEffect(() => {
    if (!isDirty) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const link = target.closest('a[href]') as HTMLAnchorElement | null
      if (!link) return

      const href = link.getAttribute('href') || ''
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return
      }
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) {
          // external link: let it proceed
          return
        }
      } catch {
        // relative URL, OK
      }

      if (navigatingRef.current) return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
      setIsOpen(true)
    }

    const handlePopState = () => {
      if (navigatingRef.current) return
      // push current state back to effectively block back until user confirms
      window.history.pushState(null, document.title, window.location.href)
      setPendingHref(backHref)
      setIsOpen(true)
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      // Chrome requires returnValue to be set
      e.returnValue = ''
    }

    document.addEventListener('click', handleClick, true)
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, backHref])

  const onCancel = () => {
    setIsOpen(false)
    setPendingHref(null)
  }

  const onConfirm = async () => {
    setIsOpen(false)
    const href = pendingHref
    setPendingHref(null)
    // wait for cleanup (e.g., delete unsaved documents)
    await Promise.resolve(resetData())
    if (href) {
      navigatingRef.current = true
      router.push(href)
      // reset the flag shortly after navigation starts
      setTimeout(() => (navigatingRef.current = false), 100)
    }
  }

  return (
    <LeavingDialog
      isOpen={isOpen}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={title || 'Unsaved Changes'}
      description={
        description ||
        'You have unsaved changes. If you leave now, they will be lost. Are you sure you want to leave?'
      }
    />
  )
}

export default PreventNavigation
