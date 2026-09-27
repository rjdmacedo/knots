import { AddFriendSection } from '@/components/add-friend-form'
import {
  friendToSelection,
  type FriendSelection,
} from '@/components/friend-picker'
import { SearchSelector } from '@/components/search-selector'
import { SubmitButton } from '@/components/submit-button'
import { Badge } from '@/components/ui/badge'
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
import {
  currencyForUser,
  defaultCurrencyList,
  getCurrency,
} from '@/lib/currency'
import { GroupFormValues, groupFormSchema } from '@/lib/schemas'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
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
  /** Preferred currency of the creator. Used only when creating a group. */
  defaultCurrencyCode?: string | null
  onSubmit: (
    groupFormValues: GroupFormValues,
    members?: FriendSelection[],
  ) => Promise<void>
}

export function GroupForm({ group, defaultCurrencyCode, onSubmit }: Props) {
  const locale = useLocale()
  const t = useTranslations('GroupForm')
  const creatorCurrency = currencyForUser(defaultCurrencyCode)
  const [members, setMembers] = useState<FriendSelection[]>([])
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
          currency: creatorCurrency.symbol,
          currencyCode: creatorCurrency.code,
          simplifyDebts: true,
        },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values, group ? undefined : members)
        })}
      >
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap sm:items-start">
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

            <FormField
              control={form.control}
              name="simplifyDebts"
              render={({ field }) => (
                <FormItem className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <FormLabel className="text-base">
                      {t('SimplifyDebtsField.label')}
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label={t('SimplifyDebtsField.label')}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    {t('SimplifyDebtsField.description')}
                  </FormDescription>
                </FormItem>
              )}
            />

            {!group ? (
              <CreateGroupFriends
                members={members}
                onMembersChange={setMembers}
                disabled={form.formState.isSubmitting}
              />
            ) : null}
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

function CreateGroupFriends({
  members,
  onMembersChange,
  disabled,
}: {
  members: FriendSelection[]
  onMembersChange: (members: FriendSelection[]) => void
  disabled?: boolean
}) {
  const t = useTranslations('GroupForm.FriendsField')
  const tFriends = useTranslations('Friends')
  const { data: friends = [], isLoading } = trpc.friends.list.useQuery()
  const selectedEmails = new Set(
    members.map((member) => member.email.toLowerCase()),
  )
  const selectedUserIds = new Set(
    members.flatMap((member) => (member.userId ? [member.userId] : [])),
  )
  const availableFriends = friends.filter((friend) => {
    if (friend.friendUserId && selectedUserIds.has(friend.friendUserId)) {
      return false
    }
    return !selectedEmails.has(friend.email.toLowerCase())
  })

  function addMember(selection: FriendSelection) {
    const email = selection.email.toLowerCase()
    const alreadySelected = members.some(
      (member) =>
        member.email.toLowerCase() === email ||
        (selection.userId != null && member.userId === selection.userId),
    )
    if (alreadySelected) return
    onMembersChange([...members, selection])
  }

  function removeMember(selection: FriendSelection) {
    const email = selection.email.toLowerCase()
    onMembersChange(
      members.filter(
        (member) =>
          member.email.toLowerCase() !== email &&
          !(selection.userId != null && member.userId === selection.userId),
      ),
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-sm font-medium">{t('label')}</p>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      {members.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {members.map((member) => (
            <li key={member.userId ?? member.email}>
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm">
                <span className="max-w-40 truncate">{member.name}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('remove', { name: member.name })}
                  disabled={disabled}
                  onClick={() => removeMember(member)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <SearchSelector
        value=""
        onValueChange={(friendKey) => {
          const friend = availableFriends.find(
            (item) => (item.friendUserId ?? item.email) === friendKey,
          )
          if (friend) addMember(friendToSelection(friend))
        }}
        groups={[
          {
            items: availableFriends.map((friend) => ({
              value: friend.friendUserId ?? friend.email,
              keywords: `${friend.name} ${friend.email}`,
              label: (
                <span className="flex w-full min-w-0 items-center gap-2 text-sm">
                  <span className="shrink-0">{friend.name}</span>
                  {!friend.hasAccount ? (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {tFriends('pickerInvited')}
                    </Badge>
                  ) : null}
                  <span className="truncate text-muted-foreground">
                    {friend.email}
                  </span>
                </span>
              ),
            })),
          },
        ]}
        placeholder={tFriends('pickerSearch')}
        empty={isLoading ? tFriends('loading') : tFriends('pickerEmpty')}
        unselectedLabel={t('placeholder')}
        isLoading={isLoading}
        disabled={disabled || isLoading}
      />
      <AddFriendSection
        disabled={disabled}
        onAdded={(friend) => addMember(friendToSelection(friend))}
      />
    </div>
  )
}
