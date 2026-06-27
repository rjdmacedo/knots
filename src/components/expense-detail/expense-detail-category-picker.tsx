'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { CategoryCommand } from '@/components/category-selector'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/hooks'
import { invalidateActivityQueries } from '@/lib/invalidate-activity-queries'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import type { Category } from '@prisma/client'
import { useIsClient } from 'foxact/use-is-client'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'

type Props = {
  expenseId: string
  category: Category | null
  categories: Category[]
  /** Group expense — omit for direct (friend) expenses. */
  groupId?: string
}

export function ExpenseDetailCategoryPicker({
  groupId,
  expenseId,
  category,
  categories,
}: Props) {
  const t = useTranslations('ExpenseDetail')
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const isClient = useIsClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const onSuccess = () => {
    if (groupId) {
      utils.groups.expenses.get.invalidate({ groupId, expenseId })
      utils.groups.expenses.list.invalidate()
      utils.groups.stats.get.invalidate()
      invalidateActivityQueries(utils)
    } else {
      utils.friends.getDirectExpense.invalidate({ expenseId })
      utils.friends.getTimeline.invalidate()
    }
    setOpen(false)
  }

  const { mutate: updateGroupCategory, isPending: isGroupPending } =
    trpc.groups.expenses.updateCategory.useMutation({
      onSuccess,
      onError: () => {
        toast.error(t('categoryUpdateError'))
      },
    })

  const { mutate: updateDirectCategory, isPending: isDirectPending } =
    trpc.friends.updateDirectExpenseCategory.useMutation({
      onSuccess,
      onError: () => {
        toast.error(t('categoryUpdateError'))
      },
    })

  const isPending = groupId ? isGroupPending : isDirectPending

  const handleSelect = (categoryId: Category['id']) => {
    if (categoryId === category?.id) {
      setOpen(false)
      return
    }

    if (groupId) {
      updateGroupCategory({ groupId, expenseId, categoryId })
    } else {
      updateDirectCategory({ expenseId, categoryId })
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label={t('editCategory')}
      disabled={isPending}
      className={cn(
        'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted transition-colors',
        'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isPending && 'opacity-70',
      )}
    >
      {isPending ? (
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      ) : (
        <CategoryIcon
          category={category}
          className="size-7 text-muted-foreground"
        />
      )}
    </button>
  )

  if (!isClient || !isDesktop) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger render={trigger} />
        <DrawerContent className="p-0">
          <CategoryCommand
            categories={categories}
            onValueChange={handleSelect}
          />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-80 p-0" align="start">
        <CategoryCommand categories={categories} onValueChange={handleSelect} />
      </PopoverContent>
    </Popover>
  )
}
