import deepmerge from 'deepmerge'
import { getRequestConfig } from 'next-intl/server'
import { getUserLocale } from './lib/locale'

export const localeLabels = {
  'en-US': 'English',
  fi: 'Suomi',
  'fr-FR': 'Français',
  es: 'Español',
  'de-DE': 'Deutsch',
  'zh-CN': '简体中文',
  'zh-TW': '正體中文',
  'ja-JP': '日本語',
  'pl-PL': 'Polski',
  'ru-RU': 'Русский',
  'it-IT': 'Italiano',
  'ua-UA': 'Українська',
  ro: 'Română',
  'tr-TR': 'Türkçe',
  'pt-PT': 'Português',
  'nl-NL': 'Nederlands',
  ca: 'Català',
  'cs-CZ': 'Česky',
} as const

export const locales: (keyof typeof localeLabels)[] = Object.keys(
  localeLabels,
) as any
export type Locale = keyof typeof localeLabels
export type Locales = ReadonlyArray<Locale>
export const defaultLocale: Locale = 'en-US'

/** flagcdn country code for each locale. Catalan uses the Catalan flag. */
export const localeFlagCodes: Record<Locale, string> = {
  'en-US': 'us',
  fi: 'fi',
  'fr-FR': 'fr',
  es: 'es',
  'de-DE': 'de',
  'zh-CN': 'cn',
  'zh-TW': 'tw',
  'ja-JP': 'jp',
  'pl-PL': 'pl',
  'ru-RU': 'ru',
  'it-IT': 'it',
  'ua-UA': 'ua',
  ro: 'ro',
  'tr-TR': 'tr',
  'pt-PT': 'pt',
  'nl-NL': 'nl',
  ca: 'es-ct',
  'cs-CZ': 'cz',
}

export default getRequestConfig(async () => {
  const locale = await getUserLocale()
  const localeMessages = (await import(`../messages/${locale}.json`)).default

  let messages: any
  if (locale === defaultLocale) {
    messages = localeMessages
  } else {
    messages = deepmerge(
      (await import(`../messages/${defaultLocale}.json`)).default,
      localeMessages,
    ) as any
  }

  return {
    locale,
    messages,
  }
})
