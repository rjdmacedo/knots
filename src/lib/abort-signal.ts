import { TRPCClientError } from '@trpc/client'

function isAbortErrorLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return true
    }

    if (/abort/i.test(error.message)) {
      return true
    }
  }

  return false
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

export function isAbortError(error: unknown): boolean {
  if (isAbortErrorLike(error)) {
    return true
  }

  if (
    error instanceof TRPCClientError &&
    error.data?.code === 'CLIENT_CLOSED_REQUEST'
  ) {
    return true
  }

  if (error instanceof TRPCClientError && isAbortErrorLike(error.cause)) {
    return true
  }

  if (
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    isAbortErrorLike(error.cause)
  ) {
    return true
  }

  return false
}
