'use client'
import { Next13ProgressBar } from 'next13-progressbar'
import { useEffect, useState } from 'react'

export function ProgressBar() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <Next13ProgressBar
      height="2px"
      color="#64748b"
      options={{ showSpinner: false }}
      showOnShallow
    />
  )
}
