/**
 * Full NextAuth configuration with Prisma adapter.
 * Exports auth(), signIn(), signOut(), and handlers.
 *
 * Uses JWT strategy (required for Credentials provider).
 * The authorized callback is defined here (not in auth.config.ts)
 * because it requires Node.js modules that can't run in Edge Runtime.
 */
import { consumePasskeyLoginToken } from '@/lib/passkey'
import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@auth/prisma-adapter'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import authConfig from './auth.config'
import { verifyPassword } from './password'
import { enforceSessionLimit } from './session-limit'
import { resolveSessionUser } from './session-user'
import { tokenManager } from './token-manager'

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined

        if (!email || !password) return null

        const normalizedEmail = email.toLowerCase().trim()

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (!user) return null

        // Reject unverified accounts
        if (!user.emailVerified) return null

        // Accounts with no password (passkey-only) cannot sign in with credentials
        if (!user.passwordHash) return null

        const isValid = await verifyPassword(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
        }
      },
    }),
    // Passkey sign-in: `authorize` never trusts a client-supplied userId. It
    // exchanges a single-use, short-lived token that `passkey.verifyAuthentication`
    // minted only after a completed, server-verified WebAuthn ceremony, so the
    // resulting session shape matches a password login exactly.
    Credentials({
      id: 'passkey',
      credentials: {
        token: { type: 'text' },
      },
      async authorize(credentials) {
        const token = credentials?.token as string | undefined
        if (!token) return null

        const result = await consumePasskeyLoginToken(token)
        if (!result.ok) return null

        return {
          id: result.value.id,
          name: result.value.name,
          email: result.value.email,
          emailVerified: result.value.emailVerified,
        }
      },
    }),
    // Magic-link sign-in: the email link carries a single-use token. authorize
    // consumes it and only then builds the same session shape as a password login.
    Credentials({
      id: 'magic-link',
      credentials: {
        token: { type: 'text' },
      },
      async authorize(credentials) {
        const token = credentials?.token as string | undefined
        if (!token) return null

        const result = await tokenManager.validateMagicLinkToken(token)
        if (!result.ok) return null

        const user = await prisma.user.findUnique({
          where: { id: result.userId },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
          },
        })

        if (!user?.emailVerified) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.email = user.email
        // Set only at sign-in. Later refreshes must not slide this timestamp,
        // so the passkey gate can tell how old the sign-in is.
        token.authTime = Date.now()
      }

      if (token.id) {
        const dbUser = await resolveSessionUser(token.id as string)
        if (!dbUser) {
          return null
        }

        if (
          dbUser.sessionsInvalidatedAt &&
          typeof token.authTime === 'number' &&
          token.authTime < dbUser.sessionsInvalidatedAt.getTime()
        ) {
          return null
        }
      }

      return token
    },
    async session({ session, token }) {
      if (!token?.id) {
        return { expires: session.expires }
      }

      const user = await resolveSessionUser(token.id as string)
      if (!user) {
        return { expires: session.expires }
      }

      if (
        user.sessionsInvalidatedAt &&
        typeof token.authTime === 'number' &&
        token.authTime < user.sessionsInvalidatedAt.getTime()
      ) {
        return { expires: session.expires }
      }

      session.user.id = user.id
      session.user.name = user.name
      session.user.email = user.email
      if (typeof token.authTime === 'number') {
        session.authTime = token.authTime
      }
      return session
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await enforceSessionLimit(user.id)
      }
    },
  },
})
