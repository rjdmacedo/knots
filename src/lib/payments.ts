import type { CreationMethod } from '@prisma/client'
import { TRPCError } from '@trpc/server'

type PaymentLockFields = {
  creationMethod?: CreationMethod | null
  bundleId?: string | null
}

export function isConsolidatedPayment(expense: PaymentLockFields): boolean {
  return (
    expense.creationMethod === 'DEBT_CONSOLIDATION' ||
    (expense.bundleId != null && expense.bundleId.length > 0)
  )
}

export function assertPaymentEditable(expense: PaymentLockFields): void {
  if (isConsolidatedPayment(expense)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'This payment is part of a balance settlement and cannot be edited or deleted individually.',
    })
  }
}
