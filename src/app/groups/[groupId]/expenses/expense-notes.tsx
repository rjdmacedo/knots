'use client'

import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/hooks'
import { StickyNote } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

type Props = {
  notes: string | null
  title: string
}

export function ExpenseNotes({ notes, title }: Props) {
  const t = useTranslations('ExpenseCard')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)

  if (!notes) return null

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <StickyNote className="w-3.5 h-3.5" />
        </PopoverTrigger>
        <PopoverContent
          className="w-64"
          side="top"
          onClick={(e) => e.stopPropagation()}
        >
          <PopoverHeader>
            <PopoverTitle>{title}</PopoverTitle>
            <PopoverDescription>{notes}</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <StickyNote className="w-3.5 h-3.5" />
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {notes}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">{t('close')}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}
