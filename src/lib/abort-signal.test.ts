import { isAbortError } from '@/lib/abort-signal'
import { TRPCClientError } from '@trpc/client'

describe('isAbortError', () => {
  it('detects DOMException abort errors', () => {
    expect(
      isAbortError(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
    ).toBe(true)
  })

  it('detects fetch abort messages', () => {
    expect(isAbortError(new Error('signal is aborted without reason'))).toBe(
      true,
    )
  })

  it('detects TRPC client closed request errors', () => {
    const error = new TRPCClientError('Import cancelled', {
      result: {
        error: {
          message: 'Import cancelled',
          code: -32000,
          data: {
            code: 'CLIENT_CLOSED_REQUEST',
            httpStatus: 499,
            path: 'groups.expenses.importKnots',
          },
        },
      },
    })

    expect(isAbortError(error)).toBe(true)
  })
})
