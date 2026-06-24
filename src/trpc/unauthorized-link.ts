'use client'

import { handleUnauthorizedClient } from '@/lib/auth/handle-unauthorized-client'
import { TRPCClientError, type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import type { AppRouter } from './routers/_app'

export const unauthorizedLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const unsubscribe = next(op).subscribe({
        next(value) {
          observer.next(value)
        },
        error(err) {
          if (
            err instanceof TRPCClientError &&
            err.data?.code === 'UNAUTHORIZED'
          ) {
            handleUnauthorizedClient()
          }
          observer.error(err)
        },
        complete() {
          observer.complete()
        },
      })
      return unsubscribe
    })
  }
}
