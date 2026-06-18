import { buttonVariants } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function NotFound() {
  const t = useTranslations('Groups.NotFound')
  return (
    <div className="flex flex-col gap-2">
      <p>{t('text')}</p>
      <p>
        <Link href="/groups" className={buttonVariants({ variant: "secondary" })}>
          {t('link')}
        </Link>
      </p>
    </div>
  )
}
