'use client'

import { SubmitButton } from '@/components/submit-button'
import {
  Form,
  FormControl,
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

/**
 * Client component for changing the user's display name.
 * Uses profile.changeName tRPC mutation.
 *
 * Requirements: 5.1, 6.3, 6.5, 6.6
 */
export function NameChangeForm({ currentName }: { currentName: string }) {
  const t = useTranslations('ProfileSettings.NameForm')

  const nameChangeSchema = z.object({
    name: z.string().min(1, t('nameRequired')).max(100, t('nameMaxLength')),
  })

  type NameChangeFormValues = z.infer<typeof nameChangeSchema>

  const form = useForm<NameChangeFormValues>({
    resolver: zodResolver(nameChangeSchema),
    defaultValues: {
      name: currentName,
    },
  })

  const changeName = trpc.profile.changeName.useMutation({
    onSuccess: () => {
      toast.success(t('successToast'))
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  async function onSubmit(values: NameChangeFormValues) {
    await changeName.mutateAsync({ name: values.name })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
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
