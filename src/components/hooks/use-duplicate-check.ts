'use client'

import type { DuplicateCheckResult } from '@/lib/duplicate-expense-detection'
import { trpc } from '@/trpc/client'
import { useCallback, useState } from 'react'

type DuplicateCheckContext =
  | { type: 'group'; groupId: string }
  | { type: 'friend'; friendId: string }

interface UseDuplicateCheckOptions {
  context: DuplicateCheckContext
}

interface CheckForDuplicatesParams {
  title: string
  amount: number
  expenseDate: Date
  categoryId?: number
  excludeExpenseId?: string
}

const emptyResult: DuplicateCheckResult = { hasDuplicates: false, matches: [] }

export function useDuplicateCheck({ context }: UseDuplicateCheckOptions) {
  const [isChecking, setIsChecking] = useState(false)
  const utils = trpc.useUtils()

  const checkForDuplicates = useCallback(
    async (params: CheckForDuplicatesParams): Promise<DuplicateCheckResult> => {
      setIsChecking(true)
      try {
        if (context.type === 'group') {
          return await utils.client.groups.expenses.checkDuplicate.query({
            groupId: context.groupId,
            title: params.title,
            amount: params.amount,
            expenseDate: params.expenseDate,
            categoryId: params.categoryId,
            excludeExpenseId: params.excludeExpenseId,
          })
        } else {
          return await utils.client.friends.checkDirectDuplicate.query({
            friendId: context.friendId,
            title: params.title,
            amount: params.amount,
            expenseDate: params.expenseDate,
            categoryId: params.categoryId,
            excludeExpenseId: params.excludeExpenseId,
          })
        }
      } catch {
        // Non-blocking: resolve with empty result on failure
        return emptyResult
      } finally {
        setIsChecking(false)
      }
    },
    [context, utils.client],
  )

  return { checkForDuplicates, isChecking }
}
