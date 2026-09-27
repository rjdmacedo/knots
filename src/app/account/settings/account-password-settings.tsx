'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import {
  validatePassword,
  type PasswordValidationError,
} from '@/lib/auth/password-validation'
import { trpc } from '@/trpc/client'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { SettingsRow } from './settings-ui'

/**
 * Password row + change / remove dialogs (task 5.3, req 6.1, 6.2, 6.5, 6.7).
 *
 * Change is shown only while the account has a password. Without one, the row
 * offers Set password instead, so a passkey-only account is not asked for a
 * current password it does not have. Remove is shown only when a password and
 * at least one passkey both exist (req 6.4).
 * Both dialogs reuse `validatePassword` and live outside the profile name form
 * so their buttons cannot submit it (req 6.8).
 */

const PASSWORD_FORM_ID = 'account-password-dialog'
const REMOVE_PASSWORD_FORM_ID = 'account-password-remove-dialog'

type PasswordFormValues = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

function passwordFormSchema(
  mode: 'change' | 'set',
  message: (key: string) => string,
) {
  return z
    .object({
      currentPassword: z.string(),
      newPassword: z.string(),
      confirmPassword: z.string(),
    })
    .superRefine((data, ctx) => {
      if (mode === 'change' && !data.currentPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['currentPassword'],
          message: message('errorCurrentRequired'),
        })
      }
      if (!validatePassword(data.newPassword).valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newPassword'],
          message: message('errorRequirements'),
        })
      }
      if (data.newPassword !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['confirmPassword'],
          message: message('errorMismatch'),
        })
      }
      if (
        mode === 'change' &&
        data.newPassword &&
        data.newPassword === data.currentPassword
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['newPassword'],
          message: message('errorSame'),
        })
      }
    })
}

/** The checklist rules, in the order shown. */
const CHECKLIST: PasswordValidationError[] = [
  'TOO_SHORT',
  'MISSING_UPPERCASE',
  'MISSING_LOWERCASE',
  'MISSING_DIGIT',
]

export function AccountPasswordSettings({
  passkeyCount,
  hasPassword: hasPasswordFromServer,
}: {
  /** Number of registered passkeys; Remove also requires a password. */
  passkeyCount: number
  /** Server snapshot. The profile query replaces it after remove. */
  hasPassword: boolean
}) {
  const t = useTranslations('ProfileSettings')
  const tp = useTranslations('ProfileSettings.Password')

  const [changeOpen, setChangeOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)

  const profile = trpc.profile.getProfile.useQuery()
  const hasPassword = profile.data?.hasPassword ?? hasPasswordFromServer

  const removePassword = trpc.profile.removePassword.useMutation()

  const canRemove = hasPassword && passkeyCount > 0

  return (
    <>
      <SettingsRow
        label={t('passwordTitle')}
        description={
          hasPassword ? tp('description') : tp('noPasswordDescription')
        }
        control={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChangeOpen(true)}
            >
              {hasPassword ? tp('changeButton') : tp('setButton')}
            </Button>
            {canRemove ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setRemoveOpen(true)}
              >
                {tp('removeButton')}
              </Button>
            ) : null}
          </div>
        }
      />

      <ChangePasswordDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        mode={hasPassword ? 'change' : 'set'}
      />
      <RemovePasswordDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        mutation={removePassword}
      />
    </>
  )
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'change' | 'set'
}) {
  const tp = useTranslations('ProfileSettings.Password')
  const utils = trpc.useUtils()
  const changePassword = trpc.profile.changePassword.useMutation()
  const setPassword = trpc.profile.setPassword.useMutation()
  const isSet = mode === 'set'
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema(mode, tp)),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const newPassword = form.watch('newPassword')
  const validation = validatePassword(newPassword)
  const inFlight = changePassword.isPending || setPassword.isPending
  const rootError = form.formState.errors.root

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && inFlight) return
    onOpenChange(nextOpen)
    if (!nextOpen) form.reset()
  }

  async function onSubmit(data: PasswordFormValues) {
    try {
      if (isSet) {
        await setPassword.mutateAsync({ newPassword: data.newPassword })
        toast.success(tp('setSuccessToast'))
      } else {
        await changePassword.mutateAsync({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        })
        toast.success(tp('changeSuccessToast'))
      }
      utils.profile.getProfile.invalidate()
      onOpenChange(false)
      form.reset()
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : ''
      if (message.includes('current') || message.includes('mismatch')) {
        form.setError('currentPassword', {
          message: tp('errorCurrentIncorrect'),
        })
      } else if (message.includes('same')) {
        form.setError('newPassword', { message: tp('errorSame') })
      } else if (
        message.includes('invalid') ||
        message.includes('requirement')
      ) {
        form.setError('newPassword', { message: tp('errorRequirements') })
      } else {
        form.setError('root', {
          message: err instanceof Error ? err.message : tp('errorRequirements'),
        })
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!inFlight}>
        <DialogHeader>
          <DialogTitle>
            {isSet ? tp('setDialogTitle') : tp('changeDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {isSet ? tp('setDialogDescription') : tp('changeDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form id={PASSWORD_FORM_ID} onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {isSet ? null : (
              <Controller
                name="currentPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="account-password-current">
                      {tp('currentLabel')}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="account-password-current"
                      type="password"
                      autoComplete="current-password"
                      disabled={inFlight}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            )}
            <Controller
              name="newPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="account-password-new">
                    {tp('newLabel')}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="account-password-new"
                    type="password"
                    autoComplete="new-password"
                    disabled={inFlight}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <ul className="flex flex-col gap-1 text-xs">
              {CHECKLIST.map((rule) => {
                const met = !validation.errors.includes(rule)
                return (
                  <li
                    key={rule}
                    className="flex items-center gap-1.5 text-muted-foreground"
                  >
                    {met ? (
                      <Check
                        className="size-3.5 text-emerald-600"
                        aria-hidden
                      />
                    ) : (
                      <X
                        className="size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    {tp(`rule_${rule}`)}
                  </li>
                )
              })}
            </ul>
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="account-password-confirm">
                    {tp('confirmLabel')}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="account-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    disabled={inFlight}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            {rootError ? <FieldError errors={[rootError]} /> : null}
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={inFlight} />
            }
          >
            {tp('cancel')}
          </DialogClose>
          <Button type="submit" form={PASSWORD_FORM_ID} disabled={inFlight}>
            {inFlight ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {isSet ? tp('setButton') : tp('changeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function removePasswordSchema(message: (key: string) => string) {
  return z.object({
    currentPassword: z.string().min(1, message('errorCurrentRequired')),
  })
}

function RemovePasswordDialog({
  open,
  onOpenChange,
  mutation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mutation: ReturnType<typeof trpc.profile.removePassword.useMutation>
}) {
  const tp = useTranslations('ProfileSettings.Password')
  const utils = trpc.useUtils()
  const form = useForm<z.infer<ReturnType<typeof removePasswordSchema>>>({
    resolver: zodResolver(removePasswordSchema(tp)),
    defaultValues: { currentPassword: '' },
  })

  const inFlight = mutation.isPending

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && inFlight) return
    onOpenChange(nextOpen)
    if (!nextOpen) form.reset()
  }

  async function onSubmit(
    data: z.infer<ReturnType<typeof removePasswordSchema>>,
  ) {
    try {
      await mutation.mutateAsync({ currentPassword: data.currentPassword })
      toast.success(tp('removeSuccessToast'))
      onOpenChange(false)
      form.reset()
      utils.profile.getProfile.invalidate()
    } catch (err) {
      form.setError('currentPassword', {
        message:
          err instanceof Error ? err.message : tp('errorCurrentIncorrect'),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!inFlight}>
        <DialogHeader>
          <DialogTitle>{tp('removeDialogTitle')}</DialogTitle>
          <DialogDescription>{tp('removeDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form
          id={REMOVE_PASSWORD_FORM_ID}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="currentPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="account-password-remove-current">
                    {tp('currentLabel')}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="account-password-remove-current"
                    type="password"
                    autoComplete="current-password"
                    disabled={inFlight}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                  <FieldDescription>
                    {tp('forgotPrefix')}{' '}
                    <a href="/forgot-password">{tp('forgotLink')}</a>
                  </FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={inFlight} />
            }
          >
            {tp('cancel')}
          </DialogClose>
          <Button
            type="submit"
            form={REMOVE_PASSWORD_FORM_ID}
            variant="destructive"
            disabled={inFlight}
          >
            {inFlight ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {tp('removeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
