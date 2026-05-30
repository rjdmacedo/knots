/// Service Worker for Knots Push Notifications
/// Handles push events with locale-aware content resolution and notification click navigation.

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
const DEFAULT_URL = '/groups'
const LOCALE_CACHE_KEY = 'sw-locales-v1'

// --- Locale Resolution ---

/**
 * Matches a navigator language string against supported locales.
 * Tries exact match first, then language-only prefix match, falls back to en-US.
 */
function resolveLocale(navigatorLanguage) {
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

/**
 * Interpolates parameters into a template string.
 * Replaces {key} placeholders with values from params.
 */
function interpolate(template, params) {
  if (!template || !params) return template
  return Object.entries(params).reduce(
    (result, [key, value]) =>
      result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
    template,
  )
}

/**
 * Resolves a dot-notation locale key (e.g., "notifications.expenseCreated")
 * to a translation string from the locale data.
 *
 * Key mapping: "notifications.xyz" → localeData[locale]["xyz"]
 * The locale data is structured as { locale: { key: value } } from sw-locales.json.
 */
function getTranslation(localeData, locale, key) {
  // The localeKey uses dot notation like "notifications.expenseCreated"
  // We strip the "notifications." prefix to get the actual key in the Notifications namespace
  const actualKey = key.startsWith('notifications.')
    ? key.slice('notifications.'.length)
    : key

  const localeStrings = localeData && localeData[locale]
  if (localeStrings && localeStrings[actualKey] !== undefined) {
    return localeStrings[actualKey]
  }
  return undefined
}

/**
 * Resolves notification content using the fallback chain:
 * 1. Target locale translation
 * 2. en-US translation
 * 3. Raw locale key
 */
function resolveNotificationContent(localeData, localeKey, params, locale) {
  const groupParam = params && (params.group || params.title || '')

  // Resolve body text with fallback chain
  let body =
    getTranslation(localeData, locale, localeKey) ||
    getTranslation(localeData, DEFAULT_LOCALE, localeKey) ||
    localeKey

  body = interpolate(body, params)

  // Resolve title: use "notificationTitle" key with group param, fallback to app name
  let title =
    getTranslation(localeData, locale, 'notifications.notificationTitle') ||
    getTranslation(
      localeData,
      DEFAULT_LOCALE,
      'notifications.notificationTitle',
    ) ||
    APP_NAME

  if (groupParam) {
    title = interpolate(title, { group: groupParam })
  } else {
    title = APP_NAME
  }

  return { title, body }
}

// --- Locale Data Caching ---

/**
 * Fetches and caches sw-locales.json during install.
 * Returns cached locale data or null if unavailable.
 */
async function fetchAndCacheLocaleData() {
  try {
    const cache = await caches.open(LOCALE_CACHE_KEY)
    const response = await fetch('/sw-locales.json')
    if (response.ok) {
      await cache.put('/sw-locales.json', response.clone())
      return response.json()
    }
  } catch (e) {
    // Locale data not available yet — will use defaults
  }
  return null
}

/**
 * Retrieves locale data from cache.
 */
async function getCachedLocaleData() {
  try {
    const cache = await caches.open(LOCALE_CACHE_KEY)
    const response = await cache.match('/sw-locales.json')
    if (response) {
      return response.json()
    }
  } catch (e) {
    // Cache unavailable
  }
  return null
}

// --- Service Worker Lifecycle ---

self.addEventListener('install', (event) => {
  event.waitUntil(fetchAndCacheLocaleData().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// --- Push Event Handler ---

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event))
})

async function handlePush(event) {
  let payload = null

  try {
    if (event.data) {
      payload = event.data.json()
    }
  } catch (e) {
    // Invalid JSON — use defaults
  }

  // If no payload or missing localeKey, show defaults
  if (!payload || !payload.localeKey) {
    return self.registration.showNotification(APP_NAME, {
      body: DEFAULT_BODY,
      data: { url: (payload && payload.url) || DEFAULT_URL },
    })
  }

  const { localeKey, params = {}, url } = payload

  // Determine device locale
  const navigatorLanguage = self.navigator && self.navigator.language
  const locale = resolveLocale(navigatorLanguage)

  // Load locale data from cache
  const localeData = await getCachedLocaleData()

  let title, body

  if (localeData) {
    const resolved = resolveNotificationContent(
      localeData,
      localeKey,
      params,
      locale,
    )
    title = resolved.title
    body = resolved.body
  } else {
    // No locale data available — use defaults
    title = APP_NAME
    body = DEFAULT_BODY
  }

  return self.registration.showNotification(title, {
    body,
    data: { url: url || DEFAULT_URL },
  })
}

// --- Notification Click Handler ---

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(handleNotificationClick(event))
})

async function handleNotificationClick(event) {
  const url =
    (event.notification.data && event.notification.data.url) || DEFAULT_URL

  // Try to find an existing window/tab with the app open
  const clientList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })

  // Check if there's already a window we can focus and navigate
  for (const client of clientList) {
    // Match by origin — navigate existing tab to the target URL
    if (client.url.startsWith(self.location.origin) && 'focus' in client) {
      await client.focus()
      if ('navigate' in client) {
        await client.navigate(url)
      }
      return
    }
  }

  // No existing window — open a new one
  await self.clients.openWindow(url)
}
