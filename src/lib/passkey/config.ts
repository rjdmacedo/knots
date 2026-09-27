/**
 * WebAuthn relying-party configuration.
 *
 * The relying-party ID (rpID) and expected origin are derived from the app URL,
 * matching how `src/lib/auth/email-service.ts` resolves its base URL
 * (`NEXTAUTH_URL` → `NEXT_PUBLIC_APP_URL` → localhost). Registration and
 * authentication verification check the response's origin and rpID against
 * these values, so a credential minted for another origin is rejected.
 */

const APP_NAME = 'Knots'

/**
 * The app's base URL. Mirrors `email-service.ts` so links, emails, and passkey
 * ceremonies all agree on what "this app" is.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

/**
 * The expected WebAuthn origin — the scheme + host (+ port) of the app URL.
 * This is the value browsers put in `clientDataJSON.origin`.
 */
export function getExpectedOrigin(): string {
  return new URL(getAppBaseUrl()).origin
}

/**
 * The relying-party ID — the effective domain (hostname only, no port). A
 * passkey is scoped to this domain, so it must stay stable across ports and
 * schemes for the same host (e.g. `localhost`, `knots.example.com`).
 */
export function getRpID(): string {
  return new URL(getAppBaseUrl()).hostname
}

/** Human-readable relying-party name shown by authenticators during registration. */
export function getRpName(): string {
  return APP_NAME
}
