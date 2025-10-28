import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from './src/i18n'

export default createMiddleware({
  // A list of all locales that are supported
  locales,
  
  // Used when no locale matches
  defaultLocale,
  
  // Only show locale in URL for non-default locale
  localePrefix: 'as-needed'
})

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(de-DE|en-US|fi|fr-FR|es|zh-CN|zh-TW|ja-JP|pl-PL|ru-RU|it-IT|ua-UA|ro|tr-TR|pt-BR|nl-NL|ca|cs-CZ)/:path*']
}
