/**
 * NextAuth edge-compatible configuration.
 * Contains providers, custom pages, and authorized callback for middleware.
 * This file must NOT import Prisma or any Node.js-only modules.
 */
import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { NextResponse } from 'next/server'

/** Routes accessible without authentication */
const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/api/health',
]

/** Routes that authenticated users should be redirected away from */
const authRoutes = ['/login', '/register', '/forgot-password']

export default {
  providers: [
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      // authorize is handled in auth.ts (full config), not here
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      const isAuthenticated = !!auth?.user

      // Authenticated users on auth pages → redirect to /groups
      if (isAuthenticated && authRoutes.includes(pathname)) {
        return NextResponse.redirect(new URL('/groups', request.nextUrl.origin))
      }

      // Public routes are accessible without auth
      if (publicRoutes.includes(pathname)) {
        return true
      }

      // Allow invite pages without auth (proxy will redirect to login with callbackUrl)
      if (pathname.startsWith('/invite/')) {
        return isAuthenticated
      }

      // All other routes require authentication
      return isAuthenticated
    },
  },
} satisfies NextAuthConfig
