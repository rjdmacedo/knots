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
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const searchParams = useSearchParams()
  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [passwordErrors, setPasswordErrors] = useState<string[]>([])

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  useEffect(() => {
    const emailFromQuery = searchParams.get('email')
    if (!emailFromQuery) return

    const parsedEmail = z.string().email().safeParse(emailFromQuery)
    if (parsedEmail.success) {
      form.setValue('email', parsedEmail.data)
    }
  }, [form, searchParams])

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      setSuccess(true)
      setServerError(null)
    },
    onError: (error) => {
      setServerError(error.message)
    },
  })

  function onSubmit(values: RegisterFormValues) {
    setServerError(null)
    setPasswordErrors([])

    // Client-side password validation with specific error messages
    const validation = validatePassword(values.password)
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
      setPasswordErrors(errorMessages)
      return
    }

    registerMutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
    })
  }

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Registration successful
          </CardTitle>
          <CardDescription>Your account has been created</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>
              We&apos;ve sent a verification link to your email address. Please
              click the link to verify your account before logging in.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            Go to login
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your details below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertTitle>Registration failed</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Your name"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  {passwordErrors.length > 0 && (
                    <ul className="text-destructive text-sm list-disc list-inside">
                      {passwordErrors.map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                    </ul>
                  )}
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
                  <FormLabel>Confirm password</FormLabel>
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
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className={cn(buttonVariants())}>
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
