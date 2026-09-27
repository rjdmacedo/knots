'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { magicLinkLoginAction } from '@/lib/auth/actions'
import { cn } from '@/lib/utils'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const startedTokens = new Set<string>()

export default function MagicLinkPage() {
  const t = useTranslations('Login')
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const callbackUrl = searchParams.get('callbackUrl') ?? undefined
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError(t('magicLinkInvalid'))
      return
    }
    if (startedTokens.has(token)) return
    startedTokens.add(token)

    void magicLinkLoginAction({ token, redirectTo: callbackUrl }).then(
      (result) => {
        if (!result.ok) setError(result.error)
      },
    )
  }, [token, callbackUrl, t])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {error ? t('magicLinkFailedTitle') : t('magicLinkSigningIn')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('magicLinkFailedTitle')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('magicLinkSigningIn')}
          </p>
        )}
      </CardContent>
      {error ? (
        <CardFooter>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            {t('backToLogin')}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  )
}
