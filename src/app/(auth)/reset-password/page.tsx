'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { validatePassword } from '@/lib/auth/password-validation'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(1, 'Password is required'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

type TokenErrorType = 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'TOKEN_INVALID' | null

export default function ResetPasswordPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [success, setSuccess] = useState(false)
  const [tokenError, setTokenError] = useState<TokenErrorType>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true)
      setServerError(null)
      setTokenError(null)
    },
    onError: (error) => {
      const message = error.message.toLowerCase()

      if (message.includes('expired')) {
        setTokenError('TOKEN_EXPIRED')
        setServerError(null)
      } else if (message.includes('already been used')) {
        setTokenError('TOKEN_USED')
        setServerError(null)
      } else if (message.includes('invalid')) {
        setTokenError('TOKEN_INVALID')
        setServerError(null)
      } else {
        setServerError(error.message)
        setTokenError(null)
      }
    },
  })

  function onSubmit(values: ResetPasswordFormValues) {
    setServerError(null)
    setTokenError(null)

    // Client-side password validation with specific error messages
    const validation = validatePassword(values.newPassword)
    if (!validation.valid) {
      const errorMessages: string[] = []
      for (const err of validation.errors) {
        switch (err) {
          case 'TOO_SHORT':
            errorMessages.push('Must be at least 8 characters')
            break
          case 'TOO_LONG':
            errorMessages.push('Must be no more than 128 characters')
            break
          case 'MISSING_UPPERCASE':
            errorMessages.push('Must contain at least one uppercase letter')
            break
          case 'MISSING_LOWERCASE':
            errorMessages.push('Must contain at least one lowercase letter')
            break
          case 'MISSING_DIGIT':
            errorMessages.push('Must contain at least one digit')
            break
        }
      }
      form.setError('newPassword', {
        type: 'manual',
        message: errorMessages.join('. '),
      })
      return
    }

    if (!token) {
      setTokenError('TOKEN_INVALID')
      return
    }

    resetPasswordMutation.mutate({
      token,
      newPassword: values.newPassword,
    })
  }

  // No token in URL
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            Invalid reset link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              This password reset link is invalid. Please request a new one.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button asChild variant="default" className="w-full">
            <Link href="/forgot-password">Request new reset link</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Token error states
  if (tokenError) {
    const errorConfig = {
      TOKEN_EXPIRED: {
        title: 'Link expired',
        description:
          'This password reset link has expired. Please request a new one.',
        showRequestNew: true,
      },
      TOKEN_USED: {
        title: 'Link already used',
        description:
          'This password reset link has already been used. If you need to reset your password again, please request a new link.',
        showRequestNew: true,
      },
      TOKEN_INVALID: {
        title: 'Invalid link',
        description:
          'This password reset link is invalid. Please request a new one.',
        showRequestNew: true,
      },
    }

    const config = errorConfig[tokenError]

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            {config.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{config.description}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {config.showRequestNew && (
            <Button asChild variant="default" className="w-full">
              <Link href="/forgot-password">Request new reset link</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Success state
  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Password reset successful
          </CardTitle>
          <CardDescription>
            Your password has been updated. You can now sign in with your new
            password.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Reset password form
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Min 8 characters, max 128. Must include at least one
                    uppercase letter, one lowercase letter, and one digit.
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Resetting…
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
