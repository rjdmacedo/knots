import { useCallback, useRef } from 'react'

export function useImportDialogDismiss(
  isImporting: boolean,
  onOpenChange: (open: boolean) => void,
  onImportAbort?: () => void,
) {
  const importAbortControllerRef = useRef<AbortController | null>(null)
  const importCancelledRef = useRef(false)

  const abortImport = useCallback(() => {
    importCancelledRef.current = true
    importAbortControllerRef.current?.abort()
    onImportAbort?.()
  }, [onImportAbort])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean, eventDetails?: { cancel?: () => void }) => {
      if (!nextOpen && isImporting) {
        eventDetails?.cancel?.()
        return
      }
      onOpenChange(nextOpen)
    },
    [isImporting, onOpenChange],
  )

  const handleCloseClick = useCallback(() => {
    if (isImporting) {
      abortImport()
    }
    onOpenChange(false)
  }, [abortImport, isImporting, onOpenChange])

  const beginImport = useCallback(() => {
    importAbortControllerRef.current?.abort()
    importCancelledRef.current = false
    importAbortControllerRef.current = new AbortController()
  }, [])

  const getImportSignal = useCallback(
    () => importAbortControllerRef.current?.signal,
    [],
  )

  const isImportCancelled = useCallback(() => importCancelledRef.current, [])

  const resetImportCancelled = useCallback(() => {
    importCancelledRef.current = false
    importAbortControllerRef.current = null
  }, [])

  return {
    handleDialogOpenChange,
    handleCloseClick,
    beginImport,
    getImportSignal,
    abortImport,
    isImportCancelled,
    resetImportCancelled,
  }
}
