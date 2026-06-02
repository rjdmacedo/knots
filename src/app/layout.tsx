import { ApplePwaSplash } from '@/app/apple-pwa-splash'
import { AppHeader } from '@/components/app-header'
import { Footer } from '@/components/footer'
import { ProgressBar } from '@/components/progress-bar'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { auth } from '@/lib/auth/auth'
import { env } from '@/lib/env'
import { TRPCProvider } from '@/trpc/client'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
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

function Content({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode
  isAuthenticated: boolean
}) {
  return (
    <TRPCProvider>
      <TooltipProvider>
        <AppHeader isAuthenticated={isAuthenticated} />
        <div className="flex-1 overflow-y-auto py-16">
          <main className="flex flex-col min-h-full py-4">{children}</main>
        </div>
        <Footer />
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
  const session = await auth()

  return (
    <html lang={locale} suppressHydrationWarning>
      <ApplePwaSplash icon="/logo-with-text.png" color="#027756" />
      <body className="h-dvh overflow-hidden flex flex-col items-stretch">
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
            <Content isAuthenticated={!!session?.user}>{children}</Content>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
