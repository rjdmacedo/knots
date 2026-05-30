/**
 * Unit tests for the service worker locale resolution logic.
 *
 * Since the service worker is a plain JS file (public/sw.js), we re-implement
 * the pure functions here for testing. These must stay in sync with sw.js.
 */

import swLocalesJson from '../../../../public/sw-locales.json'

const swLocales = swLocalesJson as Record<string, Record<string, string>>

// --- Extracted from public/sw.js for testing ---

const SUPPORTED_LOCALES = [
  'ca',
  'cs-CZ',
  'de-DE',
  'en-US',
  'es',
  'fi',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru-RU',
  'tr-TR',
  'ua-UA',
  'zh-CN',
  'zh-TW',
]

const DEFAULT_LOCALE = 'en-US'
const APP_NAME = 'Knots'

function resolveLocale(navigatorLanguage: string | null | undefined): string {
  if (!navigatorLanguage) return DEFAULT_LOCALE

  // Exact match (case-insensitive)
  const exact = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase() === navigatorLanguage.toLowerCase(),
  )
  if (exact) return exact

  // Language prefix match (e.g., "pt" matches "pt-BR")
  const langPrefix = navigatorLanguage.split('-')[0].toLowerCase()
  const prefixMatch = SUPPORTED_LOCALES.find(
    (l) => l.toLowerCase().split('-')[0] === langPrefix,
  )
  if (prefixMatch) return prefixMatch

  return DEFAULT_LOCALE
}

function interpolate(
  template: string | undefined | null,
  params: Record<string, string> | undefined | null,
): string | undefined | null {
  if (!template || !params) return template
  return Object.entries(params).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
    template,
  )
}

function getTranslation(
  localeData: Record<string, Record<string, string>> | null,
  locale: string,
  key: string,
): string | undefined {
  const actualKey = key.startsWith('notifications.')
    ? key.slice('notifications.'.length)
    : key

  const localeStrings = localeData && localeData[locale]
  if (localeStrings && localeStrings[actualKey] !== undefined) {
    return localeStrings[actualKey]
  }
  return undefined
}

function resolveNotificationContent(
  localeData: Record<string, Record<string, string>> | null,
  localeKey: string,
  params: Record<string, string>,
  locale: string,
): { title: string; body: string } {
  const groupParam = params && (params.group || params.title || '')

  // Resolve body text with fallback chain
  let body: string =
    getTranslation(localeData, locale, localeKey) ||
    getTranslation(localeData, DEFAULT_LOCALE, localeKey) ||
    localeKey

  body = interpolate(body, params) as string

  // Resolve title: use "notificationTitle" key with group param, fallback to app name
  let title: string =
    getTranslation(localeData, locale, 'notifications.notificationTitle') ||
    getTranslation(
      localeData,
      DEFAULT_LOCALE,
      'notifications.notificationTitle',
    ) ||
    APP_NAME

  if (groupParam) {
    title = interpolate(title, { group: groupParam }) as string
  } else {
    title = APP_NAME
  }

  return { title, body }
}

// --- Test Data ---

const mockLocaleData: Record<string, Record<string, string>> = {
  'en-US': {
    subscribe: 'Enable notifications',
    expenseCreated: '{actor} added "{title}"',
    expenseUpdated: '{actor} updated "{title}"',
    expenseDeleted: '{actor} deleted "{title}"',
    groupUpdated: '{actor} updated the group "{group}"',
    notificationTitle: 'Knots – {group}',
    defaultBody: 'New activity in your group',
  },
  'pt-BR': {
    subscribe: 'Ativar notificações',
    expenseCreated: '{actor} adicionou "{title}"',
    expenseUpdated: '{actor} atualizou "{title}"',
    expenseDeleted: '{actor} excluiu "{title}"',
    groupUpdated: '{actor} atualizou o grupo "{group}"',
    notificationTitle: 'Knots – {group}',
    defaultBody: 'Nova atividade no seu grupo',
  },
  'de-DE': {
    subscribe: 'Benachrichtigungen aktivieren',
    expenseCreated: '{actor} hat "{title}" hinzugefügt',
    notificationTitle: 'Knots – {group}',
    // Missing some keys intentionally for fallback testing
  },
}

// --- Tests ---

describe('resolveLocale', () => {
  it('returns en-US for null/undefined/empty input', () => {
    expect(resolveLocale(null)).toBe('en-US')
    expect(resolveLocale(undefined)).toBe('en-US')
    expect(resolveLocale('')).toBe('en-US')
  })

  it('matches exact locale (case-insensitive)', () => {
    expect(resolveLocale('en-US')).toBe('en-US')
    expect(resolveLocale('pt-BR')).toBe('pt-BR')
    expect(resolveLocale('de-DE')).toBe('de-DE')
    expect(resolveLocale('ja-JP')).toBe('ja-JP')
  })

  it('matches case-insensitively', () => {
    expect(resolveLocale('en-us')).toBe('en-US')
    expect(resolveLocale('PT-BR')).toBe('pt-BR')
    expect(resolveLocale('De-De')).toBe('de-DE')
  })

  it('matches by language prefix when no exact match', () => {
    // "pt" should match "pt-BR" (first pt- locale in the list)
    expect(resolveLocale('pt')).toBe('pt-BR')
    // "de" should match "de-DE"
    expect(resolveLocale('de')).toBe('de-DE')
    // "fr" should match "fr-FR"
    expect(resolveLocale('fr')).toBe('fr-FR')
    // "zh" should match "zh-CN" (first zh- locale in the list)
    expect(resolveLocale('zh')).toBe('zh-CN')
  })

  it('matches prefix for regional variants not in the list', () => {
    // "pt-PT" is in the list, but "pt-AO" is not — should match "pt-BR" (first pt- match)
    expect(resolveLocale('pt-AO')).toBe('pt-BR')
    // "en-GB" is not in the list — should match "en-US"
    expect(resolveLocale('en-GB')).toBe('en-US')
    // "fr-CA" is not in the list — should match "fr-FR"
    expect(resolveLocale('fr-CA')).toBe('fr-FR')
  })

  it('falls back to en-US for unsupported locales', () => {
    expect(resolveLocale('ko-KR')).toBe('en-US')
    expect(resolveLocale('ar')).toBe('en-US')
    expect(resolveLocale('sv-SE')).toBe('en-US')
    expect(resolveLocale('xyz')).toBe('en-US')
  })

  it('handles all 19 supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(resolveLocale(locale)).toBe(locale)
    }
  })
})

describe('resolveNotificationContent', () => {
  it('resolves content in the target locale', () => {
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.expenseCreated',
      { actor: 'Alice', title: 'Dinner' },
      'pt-BR',
    )
    expect(result.body).toBe('Alice adicionou "Dinner"')
    expect(result.title).toBe('Knots – Dinner')
  })

  it('resolves content in en-US', () => {
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.expenseCreated',
      { actor: 'Bob', title: 'Lunch' },
      'en-US',
    )
    expect(result.body).toBe('Bob added "Lunch"')
    expect(result.title).toBe('Knots – Lunch')
  })

  it('falls back to en-US when key is missing in target locale', () => {
    // de-DE is missing "expenseDeleted" in our mock
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.expenseDeleted',
      { actor: 'Charlie', title: 'Taxi' },
      'de-DE',
    )
    // Should fall back to en-US
    expect(result.body).toBe('Charlie deleted "Taxi"')
  })

  it('falls back to en-US when locale is unsupported', () => {
    // ko-KR is not in our mock data
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.expenseCreated',
      { actor: 'Dave', title: 'Coffee' },
      'ko-KR',
    )
    // Should fall back to en-US
    expect(result.body).toBe('Dave added "Coffee"')
    expect(result.title).toBe('Knots – Coffee')
  })

  it('returns raw key when key is missing in both target and en-US', () => {
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.unknownKey',
      { actor: 'Eve' },
      'pt-BR',
    )
    expect(result.body).toBe('notifications.unknownKey')
  })

  it('returns app name as title when no group param available', () => {
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.expenseCreated',
      { actor: 'Frank' },
      'en-US',
    )
    expect(result.title).toBe('Knots')
  })

  it('uses group param for title when available', () => {
    const result = resolveNotificationContent(
      mockLocaleData,
      'notifications.groupUpdated',
      { actor: 'Grace', group: 'Vacation' },
      'en-US',
    )
    expect(result.body).toBe('Grace updated the group "Vacation"')
    expect(result.title).toBe('Knots – Vacation')
  })

  it('handles null locale data gracefully (returns raw key)', () => {
    const result = resolveNotificationContent(
      null,
      'notifications.expenseCreated',
      { actor: 'Hank', title: 'Groceries' },
      'en-US',
    )
    expect(result.body).toBe('notifications.expenseCreated')
    expect(result.title).toBe('Knots')
  })
})

describe('generate-sw-locales script output', () => {
  it('generates valid JSON with all 19 locales', () => {
    expect(Object.keys(swLocales)).toHaveLength(19)
    for (const locale of SUPPORTED_LOCALES) {
      expect(swLocales[locale]).toBeDefined()
    }
  })

  it('each locale has the required notification keys', () => {
    const requiredKeys = [
      'expenseCreated',
      'expenseUpdated',
      'expenseDeleted',
      'groupUpdated',
      'notificationTitle',
      'defaultBody',
    ]

    for (const locale of SUPPORTED_LOCALES) {
      for (const key of requiredKeys) {
        expect(swLocales[locale][key]).toBeDefined()
        expect(typeof swLocales[locale][key]).toBe('string')
        expect(swLocales[locale][key].length).toBeGreaterThan(0)
      }
    }
  })

  it('en-US has correct interpolation placeholders', () => {
    const enUS = swLocales['en-US']

    expect(enUS.expenseCreated).toContain('{actor}')
    expect(enUS.expenseCreated).toContain('{title}')
    expect(enUS.groupUpdated).toContain('{actor}')
    expect(enUS.groupUpdated).toContain('{group}')
    expect(enUS.notificationTitle).toContain('{group}')
  })
})
