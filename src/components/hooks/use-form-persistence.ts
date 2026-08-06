'use client'

import { useCallback } from 'react'

interface UseFormPersistenceOptions {
  key: string
}

export function useFormPersistence<T>({ key }: UseFormPersistenceOptions) {
  const save = useCallback(
    (data: T): boolean => {
      try {
        sessionStorage.setItem(key, JSON.stringify(data))
        return true
      } catch {
        return false
      }
    },
    [key],
  )

  const restore = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }, [key])

  const clear = useCallback((): void => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Silently ignore errors
    }
  }, [key])

  return { save, restore, clear }
}
