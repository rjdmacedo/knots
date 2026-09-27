/**
 * Passkey (WebAuthn) server module.
 *
 * Public surface for the passkey feature: registration/authentication option
 * generation and verification, the list/rename/delete queries, and the
 * recent-password confirmation used by the 5-minute add-passkey gate. rpID and
 * origin are derived from the app URL and every verification checks them.
 */
export {
  confirmRecentPassword,
  consumePasskeyLoginToken,
  deletePasskey,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  hasRecentAuth,
  listPasskeys,
  renamePasskey,
  verifyAuthentication,
  verifyRegistration,
  type PasskeyError,
  type PasskeyResult,
  type PasskeySummary,
} from './passkey-service'

export { getExpectedOrigin, getRpID, getRpName } from './config'
