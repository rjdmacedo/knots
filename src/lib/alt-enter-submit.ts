import type { KeyboardEvent } from 'react'

export function handleAltEnterKeyDown(
  event: KeyboardEvent,
  onSubmit: () => void,
  disabled = false,
) {
  if (disabled || event.key !== 'Enter' || !event.altKey) return
  event.preventDefault()
  onSubmit()
}
