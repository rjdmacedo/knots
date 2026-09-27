'use client'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import {
  loginAction,
  passkeyLoginAction,
  type LoginResult,
} from '@/lib/auth/actions'
import { trpc } from '@/trpc/client'
import { startAuthentication } from '@simplewebauthn/browser'
import { AlertCircle, Fingerprint, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? undefined

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPasskeyPending, startPasskeyTransition] = useTransition()
  const [passkeySupported, setPasskeySupported] = useState(false)

  const generateOptions =
    trpc.passkey.generateAuthenticationOptions.useMutation()
  const verifyAuthentication = trpc.passkey.verifyAuthentication.useMutation()

  // WebAuthn is only usable when the browser exposes PublicKeyCredential.
  useEffect(() => {
    setPasskeySupported(
      typeof window !== 'undefined' && !!window.PublicKeyCredential,
    )
  }, [])

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

  function handlePasskeySignIn() {
    setError(null)

    startPasskeyTransition(async () => {
      try {
        const options = await generateOptions.mutateAsync()
        const authResponse = await startAuthentication({ optionsJSON: options })
        const { loginToken } = await verifyAuthentication.mutateAsync({
          // The router accepts the WebAuthn response as an opaque record and
          // validates it server-side; the browser type has no index signature.
          response: authResponse as unknown as Record<string, unknown> & {
            id: string
          },
        })

        const result = await passkeyLoginAction({
          token: loginToken,
          redirectTo: callbackUrl,
        })

        if (!result.ok) {
          setError(result.error)
        }
      } catch (err) {
        // A user who dismisses the browser prompt aborts the ceremony; treat
        // that as a no-op rather than an error message.
        if (err instanceof Error && err.name === 'NotAllowedError') {
          return
        }
        setError('We could not sign you in with that passkey. Try again.')
      }
    })
  }

  const busy = isPending || isPasskeyPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </Button>

          {passkeySupported && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlePasskeySignIn}
                disabled={busy}
              >
                {isPasskeyPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="h-4 w-4" />
                )}
                Use a passkey
              </Button>
            </>
          )}
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
