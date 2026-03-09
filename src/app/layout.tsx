import { ApplePwaSplash } from '@/app/apple-pwa-splash'
import { Footer } from '@/components/footer'
import { KnotsLogo } from '@/components/knots-logo'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ProgressBar } from '@/components/progress-bar'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { env } from '@/lib/env'
import { TRPCProvider } from '@/trpc/client'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
  title: {
    default: 'Knots · Share Expenses with Friends & Family',
    template: '%s · Knots',
  },
  description:
    'Knots is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  openGraph: {
    title: 'Knots · Share Expenses with Friends & Family',
    description:
      'Knots is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
    images: `/banner.png`,
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@rjdmacedo',
    site: '@rjdmacedo',
    images: `/banner.png`,
    title: 'Knots · Share Expenses with Friends & Family',
    description:
      'Knots is a minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
  },
  appleWebApp: {
    capable: true,
    title: 'Knots',
  },
  applicationName: 'Knots',
  icons: [
    {
      url: '/android-chrome-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      url: '/android-chrome-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
}

export const viewport: Viewport = {
  themeColor: '#047857',
}

function Content({ children }: { children: React.ReactNode }) {
  const t = useTranslations()
  return (
    <TRPCProvider>
      <TooltipProvider>
        <header className="flex items-center fixed top-0 left-0 right-0 h-16 bg-background bg-opacity-50 dark:bg-opacity-50 border-b backdrop-blur-xs z-50">
          <div className="container flex justify-between">
            <Link
              className="flex items-center gap-2 hover:scale-105 transition-transform"
              href="/"
            >
              <span className="flex items-center">
                <KnotsLogo />
                <span className="ml-2 font-semibold text-xl tracking-tight">
                  Knots
                </span>
              </span>
            </Link>
            <div role="navigation" aria-label="Menu" className="flex">
              <ul className="flex items-center text-sm">
                <li>
                  <Button variant="ghost" size="sm" asChild className="-my-3">
                    <Link href="/groups">{t('Header.groups')}</Link>
                  </Button>
                </li>
                <li>
                  <LocaleSwitcher />
                </li>
                <li>
                  <ThemeToggle />
                </li>
              </ul>
            </div>
          </div>
        </header>
        <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
          <main className="flex-1 flex flex-col">{children}</main>
          <Footer />
        </div>
        <Toaster />
      </TooltipProvider>
    </TRPCProvider>
  )
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale} suppressHydrationWarning>
      <ApplePwaSplash icon="/logo-with-text.png" color="#027756" />
      <body className="mt-16 min-h-dvh flex flex-col items-stretch">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Suspense>
              <ProgressBar />
            </Suspense>
            <Content>{children}</Content>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
