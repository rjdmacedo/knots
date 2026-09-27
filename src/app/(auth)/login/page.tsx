'use client'

import {
  EmailMethodSwitch,
  type EmailMethod,
} from '@/components/auth/email-method-switch'
import { usePasskeySignIn } from '@/components/auth/use-passkey-sign-in'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { loginAction, type LoginResult } from '@/lib/auth/actions'
import { trpc } from '@/trpc/client'
import { AlertCircle, Fingerprint, Loader2, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function LoginPage() {
  const t = useTranslations('Login')
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? undefined

  const [method, setMethod] = useState<EmailMethod>('magic-link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isMagicPending, startMagicTransition] = useTransition()
  const passkey = usePasskeySignIn(callbackUrl)

  const requestMagicLink = trpc.auth.requestMagicLink.useMutation()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result: LoginResult = await loginAction({
        email,
        password,
        redirectTo: callbackUrl,
      })

      if (!result.ok) {
        setError(result.error)
      }
    })
  }

  function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError(t('magicLinkEmailRequired'))
      return
    }

    startMagicTransition(async () => {
      try {
        await requestMagicLink.mutateAsync({
          email,
          callbackUrl,
        })
        setMagicSent(true)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t('magicLinkSendFailed')
        setError(message)
      }
    })
  }

  const busy = isPending || isMagicPending || passkey.isPending

  if (magicSent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('magicLinkSentTitle')}</CardTitle>
          <CardDescription>{t('magicLinkSentDescription')}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setMagicSent(false)}
          >
            {t('backToLogin')}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {passkey.supported ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setError(null)
                passkey.signIn(setError)
              }}
              disabled={busy}
            >
              {passkey.isPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Fingerprint data-icon="inline-start" />
              )}
              {t('usePasskey')}
            </Button>
          ) : null}

          <EmailMethodSwitch method={method} onMethodChange={setMethod} />

          {method === 'magic-link' ? (
            <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {isMagicPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Mail data-icon="inline-start" />
                )}
                {t('sendSignInLink')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary"
              >
                {t('forgotPassword')}
              </Link>
              <Button type="submit" className="w-full" disabled={busy}>
                {isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : null}
                {t('signInWithPassword')}
              </Button>
            </form>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link href="/register" className="font-medium text-primary">
            {t('signUp')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
