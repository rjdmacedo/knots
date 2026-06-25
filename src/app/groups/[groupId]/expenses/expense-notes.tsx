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
import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'

type Props = {
  notes: string | null
  title: string
}

export function ExpenseNotes({ notes, title }: Props) {
  const t = useTranslations('ExpenseCard')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const closedAtRef = useRef(0)

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      closedAtRef.current = Date.now()
    }
    setOpen(newOpen)
  }, [])

  if (!notes) return null

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
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
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
      </button>
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {notes}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" onClick={(e) => e.stopPropagation()}>
                {t('close')}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}
