import { buttonVariants } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

// FIX for https://github.com/vercel/next.js/issues/58615
// export const dynamic = 'force-dynamic'

export default function HomePage() {
  const t = useTranslations()
  return (
    <div>
      <section className="py-16 md:py-24 lg:py-32">
        <div className="container flex max-w-[var(--breakpoint-md)] flex-col items-center gap-4 text-center">
          <h1 className="!leading-none font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl landing-header py-2">
            {t.rich('Homepage.title', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </h1>
          <p className="max-w-2xl leading-normal text-muted-foreground sm:text-xl sm:leading-8">
            {t.rich('Homepage.description', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="flex gap-2">
            <Link href="/groups" className={buttonVariants()}>
              {t('Homepage.button.groups')}
            </Link>
            <Link href="https://github.com/rjdmacedo/knots" className={buttonVariants({ variant: "secondary" })}>
              {t('Homepage.button.github')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
