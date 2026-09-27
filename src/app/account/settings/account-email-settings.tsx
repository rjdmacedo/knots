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
import { trpc } from '@/trpc/client'
import { Loader2, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SettingsRow } from './settings-ui'

/**
 * Email row + two-step change dialog (task 5.3, req 5.1–5.4, 5.9).
 *
 * Step `email`: enter the new address and send a code. Step `otp`: enter the
 * 6-digit code sent to that address, with a 60-second resend cooldown and a way
 * back to the address step. While a request is in flight the dialog must not
 * close (req 5.9). Server error codes are mapped to specific messages. There is
 * no `input-otp` dependency, so the code uses a plain numeric text input.
 */

const RESEND_COOLDOWN_SECONDS = 60
const OTP_LENGTH = 6

type Step = 'email' | 'otp'

/**
 * Read the server error code the profile router carries in `cause`, falling
 * back to the message. Codes: EMAIL_IN_USE, INVALID_EMAIL, SAME_EMAIL,
 * INVALID_OTP, OTP_EXPIRED, RATE_LIMITED, EMAIL_SEND_FAILED.
 */
function errorCode(error: unknown): string | null {
  const cause = (error as { data?: { cause?: unknown } } | null)?.data?.cause
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return String((cause as { code?: unknown }).code)
  }
  return null
}

export function AccountEmailSettings({ email }: { email: string }) {
  const t = useTranslations('ProfileSettings')
  const te = useTranslations('ProfileSettings.Email')
  const router = useRouter()
  const utils = trpc.useUtils()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const requestChange = trpc.profile.requestEmailChange.useMutation()
  const confirmChange = trpc.profile.confirmEmailChange.useMutation()

  const inFlight = requestChange.isPending || confirmChange.isPending

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      setCooldown((value) => {
        if (value <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current)
          return 0
        }
        return value - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    }
  }, [])

  function messageForCode(codeValue: string | null, fallback: string): string {
    switch (codeValue) {
      case 'EMAIL_IN_USE':
        return te('errorInUse')
      case 'INVALID_EMAIL':
        return te('errorInvalid')
      case 'SAME_EMAIL':
        return te('errorSame')
      case 'INVALID_OTP':
        return te('errorInvalidCode')
      case 'OTP_EXPIRED':
        return te('errorExpired')
      case 'RATE_LIMITED':
        return te('errorRateLimited')
      case 'EMAIL_SEND_FAILED':
        return te('errorSendFailed')
      default:
        return fallback
    }
  }

  function resetState() {
    setStep('email')
    setNewEmail('')
    setCode('')
    setError(null)
    setCooldown(0)
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
  }

  function handleOpenChange(nextOpen: boolean) {
    // While a request is in flight the dialog must not close (req 5.9).
    if (!nextOpen && inFlight) return
    setOpen(nextOpen)
    if (!nextOpen) resetState()
  }

  async function handleSendCode() {
    setError(null)
    const trimmed = newEmail.trim()
    if (!trimmed) {
      setError(te('errorInvalid'))
      return
    }
    try {
      await requestChange.mutateAsync({ email: trimmed })
      setStep('otp')
      setCode('')
      startCooldown()
    } catch (err) {
      setError(
        messageForCode(
          errorCode(err),
          err instanceof Error ? err.message : te('errorSendFailed'),
        ),
      )
    }
  }

  async function handleResend() {
    if (cooldown > 0 || inFlight) return
    setError(null)
    try {
      await requestChange.mutateAsync({ email: newEmail.trim() })
      startCooldown()
    } catch (err) {
      setError(
        messageForCode(
          errorCode(err),
          err instanceof Error ? err.message : te('errorSendFailed'),
        ),
      )
    }
  }

  async function handleVerify() {
    setError(null)
    if (code.length !== OTP_LENGTH) return
    try {
      await confirmChange.mutateAsync({ email: newEmail.trim(), code })
      toast.success(te('successToast'))
      setOpen(false)
      resetState()
      utils.profile.getProfile.invalidate()
      router.refresh()
    } catch (err) {
      setError(
        messageForCode(
          errorCode(err),
          err instanceof Error ? err.message : te('errorInvalidCode'),
        ),
      )
    }
  }

  return (
    <>
      <SettingsRow
        id="account-settings-email"
        label={t('emailTitle')}
        description={te('description')}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm" title={email}>
            {email}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Pencil className="size-4" aria-hidden />
            {te('changeButton')}
          </Button>
        </div>
      </SettingsRow>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!inFlight}>
          {step === 'email' ? (
            <>
              <DialogHeader>
                <DialogTitle>{te('dialogTitle')}</DialogTitle>
                <DialogDescription>{te('dialogDescription')}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="account-email-new"
                  className="text-sm font-medium"
                >
                  {te('newEmailLabel')}
                </label>
                <Input
                  id="account-email-new"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={te('newEmailPlaceholder')}
                  value={newEmail}
                  aria-invalid={error ? true : undefined}
                  disabled={inFlight}
                  onChange={(event) => {
                    setNewEmail(event.target.value)
                    if (error) setError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSendCode()
                    }
                  }}
                />
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" disabled={inFlight} />}
                >
                  {te('cancel')}
                </DialogClose>
                <Button
                  type="button"
                  onClick={handleSendCode}
                  disabled={inFlight || newEmail.trim().length === 0}
                >
                  {requestChange.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {te('sendCode')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{te('otpTitle')}</DialogTitle>
                <DialogDescription>
                  {te('otpDescription', { email: newEmail.trim() })}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="account-email-code"
                  className="text-sm font-medium"
                >
                  {te('codeLabel')}
                </label>
                <Input
                  id="account-email-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  placeholder="000000"
                  className="tracking-[0.5em]"
                  value={code}
                  aria-invalid={error ? true : undefined}
                  disabled={inFlight}
                  onChange={(event) => {
                    const digits = event.target.value
                      .replace(/\D/g, '')
                      .slice(0, OTP_LENGTH)
                    setCode(digits)
                    if (error) setError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && code.length === OTP_LENGTH) {
                      event.preventDefault()
                      void handleVerify()
                    }
                  }}
                />
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    onClick={handleResend}
                    disabled={cooldown > 0 || inFlight}
                  >
                    {cooldown > 0
                      ? te('resendIn', { seconds: cooldown })
                      : te('resend')}
                  </button>
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                    onClick={() => {
                      if (inFlight) return
                      setStep('email')
                      setCode('')
                      setError(null)
                    }}
                    disabled={inFlight}
                  >
                    {te('useDifferentEmail')}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" disabled={inFlight} />}
                >
                  {te('cancel')}
                </DialogClose>
                <Button
                  type="button"
                  onClick={handleVerify}
                  disabled={inFlight || code.length !== OTP_LENGTH}
                >
                  {confirmChange.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {te('verify')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
