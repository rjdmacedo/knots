/**
 * Passkey (WebAuthn) tRPC router.
 *
 * Registration, list, rename, and delete require an authenticated session.
 * Authentication (generate options + verify) is intentionally public — it is
 * how a signed-out user proves a passkey to create a session on the sign-in
 * page (task 3.4). All ceremony logic, challenge handling, and origin/rpID
 * checks live in `src/lib/passkey`.
 */
import {
  deletePasskey,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  listPasskeys,
  renamePasskey,
  verifyAuthentication,
  verifyRegistration,
  type PasskeyError,
} from '@/lib/passkey'
import {
  baseProcedure,
  createTRPCRouter,
  protectedProcedure,
} from '@/trpc/init'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

/**
 * The WebAuthn response objects are produced verbatim by
 * `@simplewebauthn/browser`. We accept them as opaque records here and let the
 * server library validate their shape during verification, rather than mirror
 * the full spec type in Zod.
 */
const webauthnResponseSchema = z.object({ id: z.string().min(1) }).passthrough()

const verifyRegistrationSchema = z.object({
  response: webauthnResponseSchema,
  name: z.string().max(100).optional(),
})

const verifyAuthenticationSchema = z.object({
  response: webauthnResponseSchema,
})

const renameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
})

const deleteSchema = z.object({
  id: z.string().min(1),
})

/** Maps a passkey-service error to a `TRPCError`, keeping the code in `cause`. */
function passkeyErrorToTRPCError(error: PasskeyError): TRPCError {
  const code: TRPCError['code'] =
    error.code === 'USER_NOT_FOUND'
      ? 'UNAUTHORIZED'
      : error.code === 'PASSKEY_NOT_FOUND' ||
          error.code === 'CREDENTIAL_NOT_FOUND'
        ? 'NOT_FOUND'
        : error.code === 'LAST_SIGN_IN_METHOD'
          ? 'PRECONDITION_FAILED'
          : 'BAD_REQUEST'

  return new TRPCError({ code, message: error.message, cause: error })
}

export const passkeyRouter = createTRPCRouter({
  generateRegistrationOptions: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await generateRegistrationOptions(ctx.user.id)
    if (!result.ok) throw passkeyErrorToTRPCError(result.error)
    return result.value
  }),

  verifyRegistration: protectedProcedure
    .input(verifyRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await verifyRegistration(
        ctx.user.id,
        input.response as unknown as RegistrationResponseJSON,
        input.name,
      )
      if (!result.ok) throw passkeyErrorToTRPCError(result.error)
      return result.value
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return listPasskeys(ctx.user.id)
  }),

  rename: protectedProcedure
    .input(renameSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await renamePasskey(ctx.user.id, input.id, input.name)
      if (!result.ok) throw passkeyErrorToTRPCError(result.error)
      return result.value
    }),

  delete: protectedProcedure
    .input(deleteSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await deletePasskey(ctx.user.id, input.id)
      if (!result.ok) throw passkeyErrorToTRPCError(result.error)
      return { success: true }
    }),

  generateAuthenticationOptions: baseProcedure.mutation(async () => {
    const result = await generateAuthenticationOptions()
    if (!result.ok) throw passkeyErrorToTRPCError(result.error)
    return result.value
  }),

  verifyAuthentication: baseProcedure
    .input(verifyAuthenticationSchema)
    .mutation(async ({ input }) => {
      const result = await verifyAuthentication(
        input.response as unknown as AuthenticationResponseJSON,
      )
      if (!result.ok) throw passkeyErrorToTRPCError(result.error)
      return result.value
    }),
})
