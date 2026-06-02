'use client'

import { Button } from '@/components/ui/button'
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
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

/**
 * Client component for changing the user's password.
 * Uses profile.changePassword tRPC mutation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.4, 6.5, 6.6
 */
export function PasswordChangeForm() {
  const t = useTranslations('ProfileSettings.PasswordForm')

  const passwordChangeSchema = z
    .object({
      currentPassword: z.string().min(1, t('currentPasswordRequired')),
      newPassword: z.string().min(1, t('newPasswordRequired')),
      confirmPassword: z.string().min(1, t('confirmPasswordRequired')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('passwordsDoNotMatch'),
      path: ['confirmPassword'],
    })

  type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const changePasswordMutation = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      toast.success(t('successToast'))
      form.reset()
    },
    onError: (error) => {
      const message = error.message.toLowerCase()

      if (message.includes('current password') || message.includes('mismatch')) {
        form.setError('currentPassword', {
          type: 'manual',
          message: t('currentPasswordIncorrect'),
        })
      } else if (message.includes('same password') || message.includes('same as')) {
        form.setError('newPassword', {
          type: 'manual',
          message: t('newPasswordSameAsCurrent'),
        })
      } else if (message.includes('invalid password') || message.includes('password requirements')) {
        form.setError('newPassword', {
          type: 'manual',
          message: t('passwordRequirementsNotMet'),
        })
      } else {
        toast.error(error.message)
      }
    },
  })

  function onSubmit(values: PasswordChangeFormValues) {
    // Client-side password validation
    const validation = validatePassword(values.newPassword)
    if (!validation.valid) {
      const errorMessages: string[] = []
      for (const err of validation.errors) {
        switch (err) {
          case 'TOO_SHORT':
            errorMessages.push(t('errorTooShort'))
            break
          case 'TOO_LONG':
            errorMessages.push(t('errorTooLong'))
            break
          case 'MISSING_UPPERCASE':
            errorMessages.push(t('errorMissingUppercase'))
            break
          case 'MISSING_LOWERCASE':
            errorMessages.push(t('errorMissingLowercase'))
            break
          case 'MISSING_DIGIT':
            errorMessages.push(t('errorMissingDigit'))
            break
        }
      }
      form.setError('newPassword', {
        type: 'manual',
        message: errorMessages.join('. '),
      })
      return
    }

    changePasswordMutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('currentPasswordLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('newPasswordLabel')}</FormLabel>
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
                {t('passwordHint')}
              </p>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('confirmPasswordLabel')}</FormLabel>
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
          disabled={changePasswordMutation.isPending}
        >
          {changePasswordMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('changingPassword')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>
    </Form>
  )
}
