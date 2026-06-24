/**
 * Full NextAuth configuration with Prisma adapter.
 * Exports auth(), signIn(), signOut(), and handlers.
 *
 * Uses JWT strategy (required for Credentials provider).
 * The authorized callback is defined here (not in auth.config.ts)
 * because it requires Node.js modules that can't run in Edge Runtime.
 */
import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@auth/prisma-adapter'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import authConfig from './auth.config'
import { verifyPassword } from './password'
import { enforceSessionLimit } from './session-limit'
import { resolveSessionUser } from './session-user'

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
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.name = user.name
        token.email = user.email
      }

      if (token.id) {
        const dbUser = await resolveSessionUser(token.id as string)
        if (!dbUser) {
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

      session.user.id = user.id
      session.user.name = user.name
      session.user.email = user.email
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
