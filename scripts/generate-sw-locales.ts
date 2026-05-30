/**
 * Extracts the "Notifications" namespace from all locale files
 * and writes a bundled JSON file for the service worker.
 *
 * Output: public/sw-locales.json
 * Structure: { "en-US": { "expenseCreated": "...", ... }, "pt-BR": { ... }, ... }
 *
 * Usage: npx ts-node -T scripts/generate-sw-locales.ts
 */
import fs from 'node:fs'
import path from 'node:path'

const MESSAGES_DIR = path.resolve(__dirname, '../messages')
const OUTPUT_PATH = path.resolve(__dirname, '../public/sw-locales.json')

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

function main() {
  const localeData: Record<string, Record<string, string>> = {}

  for (const locale of SUPPORTED_LOCALES) {
    const filePath = path.join(MESSAGES_DIR, `${locale}.json`)

    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: locale file not found: ${filePath}`)
      continue
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      Notifications?: Record<string, string>
    }
    const notifications = content.Notifications

    if (!notifications) {
      console.warn(
        `Warning: "Notifications" namespace not found in ${locale}.json`,
      )
      continue
    }

    localeData[locale] = notifications
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(localeData))
  console.log(
    `Generated ${OUTPUT_PATH} with ${Object.keys(localeData).length} locales`,
  )
}

main()
