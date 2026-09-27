'use client'

import { passkeyLoginAction } from '@/lib/auth/actions'
import { trpc } from '@/trpc/client'
import { startAuthentication } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'

export function usePasskeySignIn(callbackUrl?: string) {
  const t = useTranslations('Login')
  const [supported, setSupported] = useState(false)
  const [isPending, startTransition] = useTransition()
  const generateOptions =
    trpc.passkey.generateAuthenticationOptions.useMutation()
  const verifyAuthentication = trpc.passkey.verifyAuthentication.useMutation()

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)
  }, [])

  function signIn(onError: (message: string) => void) {
    startTransition(async () => {
      try {
        const options = await generateOptions.mutateAsync()
        const authResponse = await startAuthentication({ optionsJSON: options })
        const { loginToken } = await verifyAuthentication.mutateAsync({
          response: authResponse as unknown as Record<string, unknown> & {
            id: string
          },
        })

        const result = await passkeyLoginAction({
          token: loginToken,
          redirectTo: callbackUrl,
        })

        if (!result.ok) onError(result.error)
      } catch (err) {
        if (err instanceof Error && err.name === 'NotAllowedError') return
        onError(t('passkeyFailed'))
      }
    })
  }

  return { supported, isPending, signIn }
}
