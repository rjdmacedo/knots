/**
 * Route protection proxy.
 * Checks for NextAuth session token cookie to determine authentication.
 * Does NOT import any Node.js modules — fully edge-compatible.
 */
import type { NextRequest } from 'next/server'
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

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for session token (NextAuth JWT cookie)
  const sessionToken =
    request.cookies.get('authjs.session-token')?.value ||
    request.cookies.get('__Secure-authjs.session-token')?.value

  const isAuthenticated = !!sessionToken

  // Authenticated users on auth pages → redirect to /groups
  if (isAuthenticated && authRoutes.includes(pathname)) {
    return NextResponse.redirect(new URL('/groups', request.url))
  }

  // Public routes are accessible without auth
  if (publicRoutes.includes(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Unauthenticated users on protected routes → redirect to login
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|css|woff2?|txt|xml|webmanifest)$).*)',
  ],
}
