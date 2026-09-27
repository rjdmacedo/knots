'use client'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { SettingsFieldRow, settingsControlId } from './settings-ui'

const usernameChangeSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(40, 'Username must be at most 40 characters')
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Only lowercase letters, numbers, and hyphens (cannot start or end with a hyphen)',
    ),
})

type UsernameChangeFormValues = z.infer<typeof usernameChangeSchema>

/**
 * Username row (task 8.1, req 2.1, 2.2).
 *
 * Presented as a `SettingsFieldRow`: the label points at the input on the
 * right, and Save sits beside it. The existing `profile.changeUsername`
 * mutation, client validation, and success/error toasts are preserved.
 */
export function UsernameChangeForm({
  currentUsername,
}: {
  currentUsername: string
}) {
  const t = useTranslations('ProfileSettings.UsernameForm')
  const ts = useTranslations('ProfileSettings')

  const form = useForm<UsernameChangeFormValues>({
    resolver: zodResolver(usernameChangeSchema),
    defaultValues: {
      username: currentUsername,
    },
  })

  const changeUsername = trpc.profile.changeUsername.useMutation({
    onSuccess: () => {
      toast.success(t('successToast'))
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  async function onSubmit(values: UsernameChangeFormValues) {
    await changeUsername.mutateAsync({ username: values.username })
  }

  const controlId = settingsControlId('account-settings-username')
  const currentValue = form.watch('username')
  const isDirty = currentValue.trim() !== currentUsername
  const isPending = changeUsername.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <SettingsFieldRow
          id="account-settings-username"
          label={ts('usernameTitle')}
          description={ts('usernameDescription')}
          control={
            <div className="flex flex-col gap-2 sm:items-end">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormControl>
                      <Input
                        id={controlId}
                        className="w-full text-base"
                        placeholder={t('placeholder')}
                        autoComplete="username"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={!isDirty || isPending}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {isPending ? t('saving') : t('submit')}
              </Button>
            </div>
          }
        />
      </form>
    </Form>
  )
}
