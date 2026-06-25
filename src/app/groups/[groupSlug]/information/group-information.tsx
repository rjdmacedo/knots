'use client'

import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCurrentGroup } from '../current-group-context'

export default function GroupInformation({ groupId }: { groupId: string }) {
  const t = useTranslations('Information')
  const { isLoading, groupSlug, group } = useCurrentGroup()

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex justify-between">
            <span>{t('title')}</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/groups/${groupSlug}/edit`}
                    className={cn(buttonVariants({ size: 'icon' }), '-mb-12')}
                  />
                }
              >
                <Pencil className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent>{t('edit')}</TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription className="mr-12">
            {t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm sm:prose-base max-w-full whitespace-break-spaces">
          {isLoading ? (
            <div className="py-1 flex flex-col gap-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : group.information ? (
            <p className="text-foreground">{group.information}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
