'use client'

import { ExpenseEditor } from '@/app/groups/[groupId]/expenses/expense-editor'
import type { ExpenseFormCreatePrefill } from '@/app/groups/[groupId]/expenses/expense-form'
import { getEditorReturnPath } from '@/lib/expense-editor-navigation'
import { consumeExpensePrefill } from '@/lib/expense-prefill-store'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * New_Page body. Consumes the transient create prefill for this group exactly
 * once on mount and renders the shared {@link ExpenseEditor}.
 *
 * `consumeExpensePrefill` clears the stash when read, so the consume is guarded
 * with a ref to run a single time even under React strict-mode double mounting.
 * When nothing was stashed (hard refresh, deep link), the Editor opens empty.
 */
export function NewGroupExpensePageClient({ groupId }: { groupId: string }) {
  const t = useTranslations('ExpenseDetail')
  const consumed = useRef(false)
  const [createPrefill, setCreatePrefill] = useState<
    ExpenseFormCreatePrefill | undefined
  >(undefined)

  useEffect(() => {
    if (consumed.current) return
    consumed.current = true
    setCreatePrefill(consumeExpensePrefill(groupId))
  }, [groupId])

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={getEditorReturnPath({ kind: 'new', groupId })}
        className="w-fit text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t('backToExpenses')}
      </Link>
      <ExpenseEditor groupId={groupId} createPrefill={createPrefill} />
    </div>
  )
}
