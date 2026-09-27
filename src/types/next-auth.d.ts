import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    /** Milliseconds since epoch when this session was signed in. Does not slide. */
    authTime?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    authTime?: number
  }
}
