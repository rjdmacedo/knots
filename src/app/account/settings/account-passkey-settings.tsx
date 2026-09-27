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
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { reauthenticateAction } from '@/lib/auth/actions'
import { trpc } from '@/trpc/client'
import { startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/server'
import { Fingerprint, Loader2, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { SettingsBadge, SettingsRow } from './settings-ui'

/**
 * Passkey row + add / delete flows (task 5.3, req 7.1, 7.2, 7.5, 7.6, 7.8).
 *
 * When WebAuthn is unavailable the add button is disabled and the row explains
 * that passkeys are unavailable on this device (req 7.2). Each registered
 * passkey shows a fingerprint icon, name, created date, a SYNCED (multiDevice)
 * or DEVICE-BOUND (singleDevice) badge, a BACKED UP badge when applicable, and
 * a destructive delete button (req 7.5).
 *
 * Adding a passkey requires a sign-in from the last 30 days. An older session
 * asks the user to sign in again (password, email link, or an existing passkey)
 * and returns here.
 */

function webauthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  )
}

export function AccountPasskeySettings() {
  const t = useTranslations('ProfileSettings')
  const tk = useTranslations('ProfileSettings.Passkey')
  const locale = useLocale()
  const utils = trpc.useUtils()

  const list = trpc.passkey.list.useQuery()
  const generateOptions = trpc.passkey.generateRegistrationOptions.useMutation()
  const verifyRegistration = trpc.passkey.verifyRegistration.useMutation()
  const deletePasskey = trpc.passkey.delete.useMutation()

  // Assume support for the first render so the server HTML matches hydration.
  // `webauthnAvailable()` is false on the server (`window` is missing) and true
  // in this browser, which otherwise mismatches the row description.
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    setSupported(webauthnAvailable())
  }, [])

  const [addOpen, setAddOpen] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })

  function resetAdd() {
    setNickname('')
    setAddError(null)
    setAddBusy(false)
  }

  async function handleAddClick() {
    const freshness = await utils.passkey.sessionFreshness.fetch()
    if (!freshness.fresh) {
      setReauthOpen(true)
      return
    }
    setAddOpen(true)
  }

  function handleAddOpenChange(nextOpen: boolean) {
    if (!nextOpen && addBusy) return
    setAddOpen(nextOpen)
    if (!nextOpen) resetAdd()
  }

  async function handleAddSubmit() {
    setAddError(null)
    setAddBusy(true)
    try {
      const options = await generateOptions.mutateAsync()
      const registration = await startRegistration({
        optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
      })

      const name = nickname.trim()
      await verifyRegistration.mutateAsync({
        // The router accepts the ceremony response as an opaque record and
        // validates its shape server-side.
        response: registration as unknown as { id: string } & Record<
          string,
          unknown
        >,
        name: name.length > 0 ? name : undefined,
      })

      toast.success(tk('addSuccessToast'))
      setAddOpen(false)
      resetAdd()
      utils.passkey.list.invalidate()
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_NOT_FRESH') {
        setAddOpen(false)
        resetAdd()
        setReauthOpen(true)
        return
      }
      const message = err instanceof Error ? err.message : tk('addFailedToast')
      setAddError(message)
      setAddBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deletePasskey.mutateAsync({ id: deleteTarget.id })
      toast.success(tk('deleteSuccessToast'))
      setDeleteTarget(null)
      utils.passkey.list.invalidate()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : tk('deleteFailedToast'),
      )
    }
  }

  const passkeys = list.data ?? []
  const finishedEmpty = list.isSuccess && passkeys.length === 0

  return (
    <>
      <SettingsRow
        label={t('passkeyTitle')}
        description={supported ? tk('description') : tk('unavailable')}
        control={
          <Button
            type="button"
            variant="outline"
            disabled={!supported}
            onClick={() => void handleAddClick()}
          >
            {tk('addButton')}
          </Button>
        }
      >
        {passkeys.length > 0 || finishedEmpty ? (
          <div className="w-full space-y-2">
            {passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Fingerprint
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium">
                      {passkey.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {tk('created', {
                          date: dateFormatter.format(
                            new Date(passkey.createdAt),
                          ),
                        })}
                      </span>
                      <SettingsBadge>
                        {passkey.deviceType === 'multiDevice'
                          ? tk('badgeSynced')
                          : tk('badgeDeviceBound')}
                      </SettingsBadge>
                      {passkey.backedUp ? (
                        <SettingsBadge>{tk('badgeBackedUp')}</SettingsBadge>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteTarget({ id: passkey.id, name: passkey.name })
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">
                    {tk('deleteAria', { name: passkey.name })}
                  </span>
                </Button>
              </div>
            ))}
            {finishedEmpty ? (
              <p className="text-sm text-muted-foreground">{tk('empty')}</p>
            ) : null}
          </div>
        ) : null}
      </SettingsRow>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent showCloseButton={!addBusy}>
          <DialogHeader>
            <DialogTitle>{tk('addDialogTitle')}</DialogTitle>
            <DialogDescription>{tk('addDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="account-passkey-nickname"
                className="text-sm font-medium"
              >
                {tk('nicknameLabel')}
              </label>
              <Input
                id="account-passkey-nickname"
                placeholder={tk('nicknamePlaceholder')}
                maxLength={100}
                value={nickname}
                disabled={addBusy}
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            {addError ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={addBusy} />}
            >
              {tk('cancel')}
            </DialogClose>
            <Button type="button" onClick={handleAddSubmit} disabled={addBusy}>
              {addBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {tk('addConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reauthOpen} onOpenChange={setReauthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tk('reauthTitle')}</DialogTitle>
            <DialogDescription>{tk('reauthDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {tk('cancel')}
            </DialogClose>
            <Button type="button" onClick={() => void reauthenticateAction()}>
              {tk('reauthConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && deletePasskey.isPending) return
          if (!nextOpen) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent showCloseButton={!deletePasskey.isPending}>
          <DialogHeader>
            <DialogTitle>{tk('deleteDialogTitle')}</DialogTitle>
            <DialogDescription>
              {tk('deleteDialogDescription', {
                name: deleteTarget?.name ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" disabled={deletePasskey.isPending} />
              }
            >
              {tk('cancel')}
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePasskey.isPending}
            >
              {deletePasskey.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {tk('deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
