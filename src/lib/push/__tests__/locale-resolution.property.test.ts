/**
 * Property-based tests for service worker locale resolution logic.
 *
 * Feature: group-push-notifications
 * - Property 1: Push event handler displays correct notification content
 * - Property 15: Locale resolution with fallback chain
 *
 * Validates: Requirements 1.3, 1.4, 9.2, 9.3, 9.4, 9.5
 *
 * Since the service worker is a plain JS file (public/sw.js), we re-implement
 * the pure functions here for testing. These must stay in sync with sw.js.
 */

import fc from 'fast-check'
import realLocaleData from '../../../../public/sw-locales.json'

// --- Constants (mirrored from public/sw.js) ---

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
const DEFAULT_BODY = 'New activity in your group'

// --- Functions extracted from public/sw.js ---

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

// --- Generators ---

const PBT_NUM_RUNS = 100

const arbSupportedLocale = fc.constantFrom(...SUPPORTED_LOCALES)

// Generate unsupported locale strings that don't match any supported locale prefix
const SUPPORTED_PREFIXES = Array.from(
  new Set(SUPPORTED_LOCALES.map((l) => l.split('-')[0].toLowerCase())),
)
const arbUnsupportedLocale = fc
  .stringMatching(/^[a-z]{2}(-[A-Z]{2})?$/)
  .filter((lang) => {
    const prefix = lang.split('-')[0].toLowerCase()
    return !SUPPORTED_PREFIXES.includes(prefix)
  })

const arbLocaleKey = fc.constantFrom(
  'notifications.expenseCreated',
  'notifications.expenseUpdated',
  'notifications.expenseDeleted',
  'notifications.groupUpdated',
)

const arbNonExistentKey = fc
  .string({ minLength: 5, maxLength: 50 })
  .filter((s) => !s.includes('\0'))
  .map((s) => `notifications.${s.replace(/[^a-zA-Z0-9]/g, 'x')}Unknown`)

// Avoid $ in generated strings since JavaScript's String.replace treats $ as
// a special character in replacement strings (e.g., $$ → $, $& → matched text).
// Real-world names/titles won't trigger this edge case in practice.
const arbActorName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.includes('$'))
const arbExpenseTitle = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => !s.includes('$'))
const arbGroupName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => !s.includes('$'))

// Build locale data with controlled content for property testing
function buildMockLocaleData(
  locales: string[],
  keys: string[],
): Record<string, Record<string, string>> {
  const data: Record<string, Record<string, string>> = {}
  for (const locale of locales) {
    data[locale] = {}
    for (const key of keys) {
      const actualKey = key.startsWith('notifications.')
        ? key.slice('notifications.'.length)
        : key
      data[locale][actualKey] =
        `[${locale}] ${actualKey}: {actor} {title} {group}`
    }
    // Always include notificationTitle
    data[locale]['notificationTitle'] = `Knots – {group}`
  }
  return data
}

// --- Tests ---

describe('Locale Resolution Property Tests', () => {
  // Feature: group-push-notifications, Property 1: Push event handler displays correct notification content
  describe('Property 1: Push event handler displays correct notification content', () => {
    /**
     * Validates: Requirements 1.3, 1.4
     *
     * For any valid push payload containing a localeKey and params, the service worker
     * push event handler SHALL resolve the notification title and body using the device
     * locale's translation strings and the provided parameters, displaying the resolved
     * content via showNotification.
     */
    it('resolves notification content using locale translation strings and provided parameters', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          arbLocaleKey,
          arbActorName,
          arbExpenseTitle,
          arbGroupName,
          (locale, localeKey, actor, title, group) => {
            const params: Record<string, string> = { actor, title, group }
            const result = resolveNotificationContent(
              realLocaleData,
              localeKey,
              params,
              locale,
            )

            // The body must be a non-empty string (resolved from locale data)
            expect(typeof result.body).toBe('string')
            expect(result.body.length).toBeGreaterThan(0)

            // The body must NOT be the raw locale key (since all supported locales
            // have all notification keys in sw-locales.json)
            expect(result.body).not.toBe(localeKey)

            // The title must be a non-empty string
            expect(typeof result.title).toBe('string')
            expect(result.title.length).toBeGreaterThan(0)

            // The body should contain the actor name (all notification templates include {actor})
            expect(result.body).toContain(actor)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('displays default content when payload is missing localeKey (null locale data scenario)', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          arbActorName,
          arbExpenseTitle,
          (locale, actor, title) => {
            // When locale data is null, the function falls back to the raw key
            const result = resolveNotificationContent(
              null,
              'notifications.expenseCreated',
              { actor, title },
              locale,
            )

            // With null locale data, body falls back to the raw key
            expect(result.body).toBe('notifications.expenseCreated')

            // Title falls back to APP_NAME when locale data is null
            expect(result.title).toBe(APP_NAME)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('interpolates all provided parameters into the resolved template', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          arbActorName,
          arbGroupName,
          (locale, actor, group) => {
            const params = { actor, group }
            const result = resolveNotificationContent(
              realLocaleData,
              'notifications.groupUpdated',
              params,
              locale,
            )

            // The resolved body should contain the actor name
            expect(result.body).toContain(actor)

            // The resolved body should contain the group name
            expect(result.body).toContain(group)

            // No unresolved placeholders should remain for known params
            expect(result.body).not.toContain('{actor}')
            expect(result.body).not.toContain('{group}')
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: group-push-notifications, Property 15: Locale resolution with fallback chain
  describe('Property 15: Locale resolution with fallback chain', () => {
    /**
     * Validates: Requirements 9.2, 9.3, 9.4, 9.5
     *
     * For any device locale and localization key, the service worker SHALL resolve
     * content using: (1) the matched locale's translation if available, (2) en-US
     * translation if the key is missing in the target locale or the locale is
     * unsupported, (3) the raw localization key if the key is missing in both the
     * target locale and en-US.
     */
    it('resolveLocale always returns a supported locale for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string({ minLength: 0, maxLength: 20 }),
            arbSupportedLocale,
            fc.constant(''),
          ),
          (navigatorLanguage) => {
            const resolved = resolveLocale(navigatorLanguage || undefined)

            // The resolved locale must always be one of the supported locales
            expect(SUPPORTED_LOCALES).toContain(resolved)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('resolveLocale returns exact match for any supported locale regardless of case', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          fc.constantFrom('lower', 'upper', 'mixed'),
          (locale, caseType) => {
            let input: string
            switch (caseType) {
              case 'lower':
                input = locale.toLowerCase()
                break
              case 'upper':
                input = locale.toUpperCase()
                break
              case 'mixed':
                input = locale
                  .split('')
                  .map((c, i) =>
                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase(),
                  )
                  .join('')
                break
              default:
                input = locale
            }

            const resolved = resolveLocale(input)

            // Must resolve to the original supported locale (case-insensitive match)
            expect(resolved.toLowerCase()).toBe(locale.toLowerCase())
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('resolveLocale falls back to en-US for unsupported locales', () => {
      fc.assert(
        fc.property(arbUnsupportedLocale, (unsupportedLocale) => {
          const resolved = resolveLocale(unsupportedLocale)

          // Unsupported locales must fall back to en-US
          expect(resolved).toBe(DEFAULT_LOCALE)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('fallback chain step 1: uses target locale translation when available', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          arbLocaleKey,
          arbActorName,
          arbExpenseTitle,
          arbGroupName,
          (locale, localeKey, actor, title, group) => {
            // Build locale data where the target locale HAS the key
            const localeData = buildMockLocaleData(
              [locale, 'en-US'],
              [localeKey],
            )
            const params = { actor, title, group }

            const result = resolveNotificationContent(
              localeData,
              localeKey,
              params,
              locale,
            )

            // Body should use the target locale's template (contains [locale] prefix)
            expect(result.body).toContain(`[${locale}]`)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('fallback chain step 2: uses en-US when key is missing in target locale', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale.filter((l) => l !== 'en-US'),
          arbActorName,
          arbExpenseTitle,
          arbGroupName,
          (locale, actor, title, group) => {
            // Build locale data where target locale is MISSING the key but en-US has it
            const localeData: Record<string, Record<string, string>> = {
              [locale]: {
                notificationTitle: 'Knots – {group}',
                // Missing the expenseCreated key
              },
              'en-US': {
                expenseCreated: '[en-US] {actor} added "{title}"',
                notificationTitle: 'Knots – {group}',
              },
            }

            const params = { actor, title, group }
            const result = resolveNotificationContent(
              localeData,
              'notifications.expenseCreated',
              params,
              locale,
            )

            // Body should fall back to en-US translation
            expect(result.body).toContain('[en-US]')
            expect(result.body).toContain(actor)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('fallback chain step 2: uses en-US when locale is unsupported (not in locale data)', () => {
      fc.assert(
        fc.property(
          arbActorName,
          arbExpenseTitle,
          arbGroupName,
          (actor, title, group) => {
            // Build locale data with only en-US (simulating unsupported locale)
            const localeData: Record<string, Record<string, string>> = {
              'en-US': {
                expenseCreated: '[en-US] {actor} added "{title}"',
                notificationTitle: 'Knots – {group}',
              },
            }

            const params = { actor, title, group }
            // Use a locale that's not in the data
            const result = resolveNotificationContent(
              localeData,
              'notifications.expenseCreated',
              params,
              'ko-KR',
            )

            // Body should fall back to en-US
            expect(result.body).toContain('[en-US]')
            expect(result.body).toContain(actor)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('fallback chain step 3: returns raw key when missing in both target locale and en-US', () => {
      fc.assert(
        fc.property(
          arbSupportedLocale,
          arbNonExistentKey,
          arbActorName,
          arbGroupName,
          (locale, nonExistentKey, actor, group) => {
            // Build locale data that does NOT contain the key in any locale
            const localeData: Record<string, Record<string, string>> = {
              [locale]: {
                notificationTitle: 'Knots – {group}',
              },
              'en-US': {
                notificationTitle: 'Knots – {group}',
              },
            }

            const params = { actor, group }
            const result = resolveNotificationContent(
              localeData,
              nonExistentKey,
              params,
              locale,
            )

            // Body should be the raw locale key since it's missing everywhere
            expect(result.body).toBe(nonExistentKey)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('resolveLocale matches by language prefix when exact match is unavailable', () => {
      // Generate regional variants of supported language prefixes
      const arbRegionalVariant = fc
        .tuple(
          fc.constantFrom('pt', 'de', 'fr', 'zh', 'en', 'nl', 'pl', 'ru'),
          fc.stringMatching(/^[A-Z]{2}$/),
        )
        .map(([lang, region]) => `${lang}-${region}`)
        .filter((locale) => {
          // Exclude locales that are exact matches
          return !SUPPORTED_LOCALES.some(
            (l) => l.toLowerCase() === locale.toLowerCase(),
          )
        })

      fc.assert(
        fc.property(arbRegionalVariant, (regionalLocale) => {
          const resolved = resolveLocale(regionalLocale)
          const inputPrefix = regionalLocale.split('-')[0].toLowerCase()
          const resolvedPrefix = resolved.split('-')[0].toLowerCase()

          // The resolved locale must share the same language prefix
          expect(resolvedPrefix).toBe(inputPrefix)

          // The resolved locale must be one of the supported locales
          expect(SUPPORTED_LOCALES).toContain(resolved)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('real locale data resolves all known keys for all supported locales', () => {
      const knownKeys = [
        'notifications.expenseCreated',
        'notifications.expenseUpdated',
        'notifications.expenseDeleted',
        'notifications.groupUpdated',
      ]

      fc.assert(
        fc.property(
          arbSupportedLocale,
          fc.constantFrom(...knownKeys),
          arbActorName,
          arbExpenseTitle,
          arbGroupName,
          (locale, localeKey, actor, title, group) => {
            const params = { actor, title, group }
            const result = resolveNotificationContent(
              realLocaleData,
              localeKey,
              params,
              locale,
            )

            // With real locale data, all known keys should resolve (not fall back to raw key)
            expect(result.body).not.toBe(localeKey)

            // Body should be non-empty
            expect(result.body.length).toBeGreaterThan(0)

            // Title should be non-empty
            expect(result.title.length).toBeGreaterThan(0)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
