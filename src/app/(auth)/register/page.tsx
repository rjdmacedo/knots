'use client'

import {
  EmailMethodSwitch,
  type EmailMethod,
} from '@/components/auth/email-method-switch'
import { usePasskeySignIn } from '@/components/auth/use-passkey-sign-in'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { validatePassword } from '@/lib/auth/password-validation'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import {
  AlertCircle,
  Check,
  Circle,
  Fingerprint,
  Loader2,
  Mail,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { z } from 'zod'

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return (words.join(' ') || 'User').slice(0, 100)
}

export default function RegisterPage() {
  const t = useTranslations('Login')
  const tr = useTranslations('Register')
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? undefined

  const [method, setMethod] = useState<EmailMethod>('magic-link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [success, setSuccess] = useState(false)
  const passkey = usePasskeySignIn(callbackUrl)

  useEffect(() => {
    const emailFromQuery = searchParams.get('email')
    if (!emailFromQuery) return
    const parsedEmail = z.string().email().safeParse(emailFromQuery)
    if (parsedEmail.success) setEmail(parsedEmail.data)
  }, [searchParams])

  const requestMagicLink = trpc.auth.requestMagicLink.useMutation()
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      setSuccess(true)
      setError(null)
    },
    onError: (mutationError) => {
      setError(mutationError.message)
    },
  })

  const passwordCheck = validatePassword(password)
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword
  const emailValid = z.string().email().safeParse(email).success
  const canSignUp =
    emailValid &&
    passwordCheck.valid &&
    passwordsMatch &&
    !registerMutation.isPending

  const rules = [
    { id: 'TOO_SHORT' as const, label: tr('ruleLength') },
    { id: 'MISSING_UPPERCASE' as const, label: tr('ruleUppercase') },
    { id: 'MISSING_LOWERCASE' as const, label: tr('ruleLowercase') },
    { id: 'MISSING_DIGIT' as const, label: tr('ruleNumber') },
  ]

  function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError(t('magicLinkEmailRequired'))
      return
    }

    requestMagicLink.mutate(
      { email, callbackUrl },
      {
        onSuccess: () => setMagicSent(true),
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!canSignUp) return

    registerMutation.mutate({
      name: nameFromEmail(email),
      email,
      password,
    })
  }

  const busy =
    registerMutation.isPending ||
    requestMagicLink.isPending ||
    passkey.isPending

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

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="size-5 text-primary" />
            {tr('successTitle')}
          </CardTitle>
          <CardDescription>{tr('successDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>{tr('successAlertTitle')}</AlertTitle>
            <AlertDescription>{tr('successAlertDescription')}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            {tr('goToLogin')}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('title')}</CardTitle>
        <CardDescription>{tr('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{tr('failedTitle')}</AlertTitle>
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
                <FieldLabel htmlFor="register-email">Email</FieldLabel>
                <Input
                  id="register-email"
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
                {requestMagicLink.isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Mail data-icon="inline-start" />
                )}
                {t('sendSignInLink')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="register-email">Email</FieldLabel>
                <Input
                  id="register-email"
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
                <FieldLabel htmlFor="register-password">Password</FieldLabel>
                <PasswordInput
                  id="register-password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {rules.map((rule) => {
                    const met =
                      password.length > 0 &&
                      !passwordCheck.errors.includes(rule.id)
                    return (
                      <li
                        key={rule.id}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        {met ? (
                          <Check className="size-3.5 text-primary" />
                        ) : (
                          <Circle className="size-3.5" />
                        )}
                        {rule.label}
                      </li>
                    )
                  })}
                </ul>
              </Field>
              <Field
                data-invalid={confirmPassword.length > 0 && !passwordsMatch}
              >
                <FieldLabel htmlFor="register-confirm">
                  {tr('confirmPassword')}
                </FieldLabel>
                <PasswordInput
                  id="register-confirm"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={busy}
                  aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
                />
                {confirmPassword.length > 0 && !passwordsMatch ? (
                  <FieldError>{tr('passwordMismatch')}</FieldError>
                ) : null}
              </Field>
              <Button
                type="submit"
                className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                disabled={!canSignUp}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : null}
                {registerMutation.isPending
                  ? tr('creating')
                  : tr('signUpWithPassword')}
              </Button>
            </form>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {tr('hasAccount')}{' '}
          <Link href="/login" className="font-medium text-primary">
            {tr('signIn')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
