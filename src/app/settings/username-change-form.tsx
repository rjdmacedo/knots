'use client'

import { SubmitButton } from '@/components/submit-button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

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

export function UsernameChangeForm({
  currentUsername,
}: {
  currentUsername: string
}) {
  const t = useTranslations('ProfileSettings.UsernameForm')

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('label')}</FormLabel>
              <FormControl>
                <Input
                  className="text-base"
                  placeholder={t('placeholder')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton loadingContent={t('saving')}>
          <Save className="w-4 h-4 mr-2" /> {t('submit')}
        </SubmitButton>
      </form>
    </Form>
  )
}
