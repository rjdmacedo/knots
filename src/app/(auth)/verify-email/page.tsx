'use client'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { CheckCircle2, Clock, Loader2, Mail, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type VerificationState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'invalid' }
  | { status: 'no-token' }

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [state, setState] = useState<VerificationState>(
    token ? { status: 'loading' } : { status: 'no-token' },
  )
  const [resendEmail, setResendEmail] = useState('')
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const hasVerified = useRef(false)

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setState({ status: 'success' })
    },
    onError: (error) => {
      // The tRPC error message matches the auth service error message
      const message = error.message

      if (message.includes('expired')) {
        setState({ status: 'expired' })
      } else if (message.includes('already been used')) {
        setState({ status: 'used' })
      } else {
        setState({ status: 'invalid' })
      }
    },
  })

  const resendMutation = trpc.auth.resendVerification.useMutation({
    onSuccess: () => {
      setResendSuccess(true)
      setResendError(null)
    },
    onError: (error) => {
      setResendError(error.message)
      setResendSuccess(false)
    },
  })

  // Trigger verification on mount when token is present
  useEffect(() => {
    if (token && !hasVerified.current) {
      hasVerified.current = true
      verifyMutation.mutate({ token })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleResend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail.trim()) return
    setResendSuccess(false)
    setResendError(null)
    resendMutation.mutate({ email: resendEmail })
  }

  if (state.status === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin" />
            Verifying your email
          </CardTitle>
          <CardDescription>
            Please wait while we verify your email address…
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (state.status === 'success') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Email verified successfully!
          </CardTitle>
          <CardDescription>
            Your email has been verified. You can now log in to your account.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Go to Login
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (state.status === 'expired') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-yellow-600" />
            Verification link expired
          </CardTitle>
          <CardDescription>
            This verification link has expired. Enter your email below to
            receive a new verification link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResend} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="resend-email">Email address</Label>
              <Input
                id="resend-email"
                type="email"
                placeholder="you@example.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Mail className="size-4" />
                  Resend verification email
                </>
              )}
            </Button>
          </form>
          {resendSuccess && (
            <Alert className="mt-4">
              <CheckCircle2 className="size-4 text-green-600" />
              <AlertTitle>Email sent</AlertTitle>
              <AlertDescription>
                If an account exists with that email, a new verification link
                has been sent.
              </AlertDescription>
            </Alert>
          )}
          {resendError && (
            <Alert variant="destructive" className="mt-4">
              <XCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{resendError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className={buttonVariants({ variant: "link" })}>
            Back to Login
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (state.status === 'used') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-blue-600" />
            Link already used
          </CardTitle>
          <CardDescription>
            This verification link has already been used. Your email may already
            be verified.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Go to Login
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (state.status === 'invalid') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-red-600" />
            Invalid verification link
          </CardTitle>
          <CardDescription>
            This verification link is invalid. Please check the link or request
            a new one.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className={buttonVariants({ variant: "link" })}>
            Back to Login
          </Link>
        </CardFooter>
      </Card>
    )
  }

  // no-token state
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="size-5 text-red-600" />
          Missing verification token
        </CardTitle>
        <CardDescription>
          No verification token was provided. Please use the link from your
          verification email.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-center">
        <Link href="/login" className={buttonVariants({ variant: "link" })}>
          Back to Login
        </Link>
      </CardFooter>
    </Card>
  )
}
