import { SubmitButton } from '@/components/submit-button'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Locale } from '@/i18n'
import { defaultCurrencyList, getCurrency } from '@/lib/currency'
import { GroupFormValues, groupFormSchema } from '@/lib/schemas'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { CurrencySelector } from './currency-selector'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

export type Props = {
  group?: {
    name: string
    information: string | null
    currency: string
    currencyCode: string | null
    simplifyDebts: boolean
  }
  onSubmit: (groupFormValues: GroupFormValues) => Promise<void>
  variant?: 'default' | 'dyad'
}

export function GroupForm({ group, onSubmit, variant = 'default' }: Props) {
  const locale = useLocale()
  const t = useTranslations('GroupForm')
  const isDyad = variant === 'dyad'
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: group
      ? {
          name: group.name,
          information: group.information ?? '',
          currency: group.currency,
          currencyCode: group.currencyCode,
          simplifyDebts: group.simplifyDebts,
        }
      : {
          name: '',
          information: '',
          currency: getCurrency(
            process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE || 'USD',
          ).symbol,
          currencyCode: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE || 'USD',
          simplifyDebts: true,
        },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values)
        })}
      >
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              {isDyad ? t('CurrencyCodeField.label') : t('title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap sm:items-start">
              {!isDyad && (
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t('NameField.label')}</FormLabel>
                      <FormControl>
                        <Input
                          className="text-base"
                          placeholder={t('NameField.placeholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('NameField.description')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="currencyCode"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>{t('CurrencyCodeField.label')}</FormLabel>
                    <CurrencySelector
                      currencies={defaultCurrencyList(
                        locale as Locale,
                        t('CurrencyCodeField.customOption'),
                      )}
                      defaultValue={form.watch(field.name) ?? ''}
                      onValueChange={(newCurrency) => {
                        if (newCurrency === field.value) return
                        field.onChange(newCurrency)
                        const currency = getCurrency(newCurrency)
                        if (
                          currency.code.length ||
                          form.getFieldState('currency').isTouched
                        )
                          form.setValue('currency', currency.symbol, {
                            shouldValidate: true,
                            shouldTouch: true,
                            shouldDirty: true,
                          })
                      }}
                      isLoading={false}
                    />
                    <FormDescription>
                      {t(
                        group
                          ? 'CurrencyCodeField.editDescription'
                          : 'CurrencyCodeField.createDescription',
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem
                    hidden={!!form.watch('currencyCode')?.length}
                    className="flex-1"
                  >
                    <FormLabel>{t('CurrencyField.label')}</FormLabel>
                    <FormControl>
                      <Input
                        className="text-base"
                        placeholder={t('CurrencyField.placeholder')}
                        maxLength={5}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('CurrencyField.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isDyad && (
              <FormField
                control={form.control}
                name="information"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('InformationField.label')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        className="text-base"
                        {...field}
                        placeholder={t('InformationField.placeholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isDyad && (
              <FormField
                control={form.control}
                name="simplifyDebts"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="flex flex-col gap-1">
                      <FormLabel className="text-base">
                        {t('SimplifyDebtsField.label')}
                      </FormLabel>
                      <FormDescription>
                        {t('SimplifyDebtsField.description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label={t('SimplifyDebtsField.label')}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex mt-4 gap-2">
          <SubmitButton
            loadingContent={t(group ? 'Settings.saving' : 'Settings.creating')}
          >
            <Save className="w-4 h-4 mr-2" />{' '}
            {t(group ? 'Settings.save' : 'Settings.create')}
          </SubmitButton>
          {!group && (
            <Link
              href="/groups"
              className={buttonVariants({ variant: 'ghost' })}
            >
              {t('Settings.cancel')}
            </Link>
          )}
        </div>
      </form>
    </Form>
  )
}
