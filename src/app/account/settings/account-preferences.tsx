'use client'

import { CurrencySelector } from '@/components/currency-selector'
import {
  SearchSelector,
  type SearchSelectorItem,
} from '@/components/search-selector'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { Locale, localeFlagCodes, localeLabels } from '@/i18n'
import { defaultCurrencyList } from '@/lib/currency'
import { setUserLocale } from '@/lib/locale'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import {
  Check,
  ChevronsUpDown,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import Image from 'next/image'
import { useEffect, useState, useTransition } from 'react'
import {
  SettingsFieldRow,
  SettingsList,
  SettingsSaving,
  SettingsSection,
  settingsControlId,
} from './settings-ui'

const TIMEZONES = Intl.supportedValuesOf('timeZone')

function formatTimezoneLabel(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(new Date())
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    return `(${offset}) ${tz.replace(/_/g, ' ')}`
  } catch {
    return tz.replace(/_/g, ' ')
  }
}

const COMMON_LOCALES: Locale[] = ['en-US', 'pt-PT']

function languageItem(locale: Locale): SearchSelectorItem {
  return {
    value: locale,
    label: localeLabels[locale],
    keywords: `${locale} ${localeLabels[locale]}`,
    icon: <LocaleFlag locale={locale} />,
  }
}

function LocaleFlag({ locale }: { locale: Locale }) {
  return (
    <Image
      src={`https://flagcdn.com/h24/${localeFlagCodes[locale]}.png`}
      alt=""
      width={16}
      height={12}
      className="h-auto w-4 shrink-0"
    />
  )
}

const THEME_VALUES = ['light', 'dark', 'system'] as const

type ThemeValue = (typeof THEME_VALUES)[number]

const THEME_ICONS: Record<ThemeValue, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

/**
 * Autosaved App preferences section (task 6.1).
 *
 * Renders its own `SettingsSection` so the header can show `SettingsSaving`
 * whenever any preference mutation is in flight (req 8.7). Four field rows in
 * order: Language, Default currency, Account timezone, Theme. No mascot row.
 *
 * - Language writes the `NEXT_LOCALE` cookie via `setUserLocale` and persists
 *   `changePreferences({ locale })` (req 8.3).
 * - Currency and timezone call `changePreferences` immediately (req 8.4).
 * - Theme calls `next-themes` `setTheme` and `changePreferences({ theme })`
 *   (req 8.5).
 */
export function AccountPreferences({
  timezone,
  preferredCurrency,
  locale: initialLocale,
  theme: initialTheme,
}: {
  timezone: string | null
  preferredCurrency: string | null
  locale: Locale | null
  theme: string | null
}) {
  const t = useTranslations('ProfileSettings')
  const tPref = useTranslations('ProfileSettings.Preferences')
  const activeLocale = useLocale() as Locale
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [localePending, startLocaleTransition] = useTransition()

  const utils = trpc.useUtils()
  const changePreferences = trpc.profile.changePreferences.useMutation({
    onSuccess: () => {
      utils.profile.getProfile.invalidate()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  // Optimistic local values so a select reflects the choice immediately.
  const [localeValue, setLocaleValue] = useState<Locale>(
    initialLocale ?? activeLocale,
  )
  const [currencyValue, setCurrencyValue] = useState<string>(
    preferredCurrency ?? 'EUR',
  )
  const [timezoneValue, setTimezoneValue] = useState<string>(
    timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const [timezoneOpen, setTimezoneOpen] = useState(false)

  const themeValue: ThemeValue = mounted
    ? ((theme as ThemeValue | undefined) ??
      (initialTheme as ThemeValue | null) ??
      'system')
    : 'system'

  // Header saving indicator is on whenever any preference write is pending.
  const isSaving = changePreferences.isPending || localePending

  function handleLocaleChange(next: Locale) {
    setLocaleValue(next)
    // Cookie write makes the next render immediate (req 8.3)…
    startLocaleTransition(async () => {
      try {
        await setUserLocale(next)
      } catch (error) {
        console.error('Failed to change locale:', error)
      }
    })
    // …and persist the choice on the user.
    changePreferences.mutate(
      { locale: next },
      {
        onSuccess: () => {
          utils.profile.getProfile.invalidate()
        },
      },
    )
  }

  function handleCurrencyChange(code: string) {
    setCurrencyValue(code)
    changePreferences.mutate(
      { preferredCurrency: code },
      { onSuccess: () => toast.success(tPref('currencySaved')) },
    )
  }

  function handleTimezoneChange(tz: string) {
    setTimezoneValue(tz)
    setTimezoneOpen(false)
    changePreferences.mutate(
      { timezone: tz },
      { onSuccess: () => toast.success(tPref('timezoneSaved')) },
    )
  }

  function handleThemeChange(next: ThemeValue) {
    setTheme(next)
    changePreferences.mutate(
      { theme: next },
      { onSuccess: () => toast.success(t('themeSaved')) },
    )
  }

  const currencies = defaultCurrencyList(activeLocale, null)
  const languageId = 'account-preferences-language'
  const currencyId = 'account-preferences-currency'
  const timezoneId = 'account-preferences-timezone'
  const themeId = 'account-preferences-theme'

  const themeLabels: Record<ThemeValue, string> = {
    light: t('themeLight'),
    dark: t('themeDark'),
    system: t('themeSystem'),
  }

  return (
    <SettingsSection
      icon={SlidersHorizontal}
      title={t('appPreferencesTitle')}
      description={t('appPreferencesDescription')}
      status={
        isSaving ? <SettingsSaving label={t('preferencesSaving')} /> : null
      }
    >
      <SettingsList>
        {/* Language */}
        <SettingsFieldRow
          id={languageId}
          label={t('languageLabel')}
          control={
            <SearchSelector
              id={settingsControlId(languageId)}
              value={localeValue}
              disabled={localePending}
              onValueChange={(next) => handleLocaleChange(next as Locale)}
              placeholder={tPref('languageSearch')}
              empty={tPref('languageEmpty')}
              groups={[
                {
                  heading: tPref('languageCommon'),
                  items: COMMON_LOCALES.map(languageItem),
                },
                {
                  heading: tPref('languageOther'),
                  items: (Object.keys(localeLabels) as Locale[])
                    .filter((locale) => !COMMON_LOCALES.includes(locale))
                    .map(languageItem),
                },
              ]}
            />
          }
        />

        {/* Default currency */}
        <SettingsFieldRow
          id={currencyId}
          label={tPref('currencyLabel')}
          control={
            <CurrencySelector
              currencies={currencies}
              defaultValue={currencyValue}
              isLoading={changePreferences.isPending}
              onValueChange={handleCurrencyChange}
            />
          }
        />

        {/* Account timezone */}
        <SettingsFieldRow
          id={timezoneId}
          label={tPref('timezoneLabel')}
          description={tPref('timezoneHelp')}
          control={
            <Popover open={timezoneOpen} onOpenChange={setTimezoneOpen}>
              <PopoverTrigger
                render={
                  <Button
                    id={settingsControlId(timezoneId)}
                    variant="outline"
                    role="combobox"
                    aria-expanded={timezoneOpen}
                    className="w-full justify-between font-normal"
                    disabled={changePreferences.isPending}
                  />
                }
              >
                <span className="truncate">
                  {timezoneValue
                    ? formatTimezoneLabel(timezoneValue)
                    : tPref('timezoneSelect')}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                  <CommandInput placeholder={tPref('timezoneSearch')} />
                  <CommandEmpty>{tPref('timezoneEmpty')}</CommandEmpty>
                  <CommandGroup className="max-h-[300px] overflow-y-auto">
                    {TIMEZONES.map((tz) => (
                      <CommandItem
                        key={tz}
                        value={tz}
                        onSelect={() => handleTimezoneChange(tz)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            timezoneValue === tz ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {formatTimezoneLabel(tz)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          }
        />

        {/* Theme */}
        <SettingsFieldRow
          id={themeId}
          label={t('themeLabel')}
          control={
            <Select
              items={THEME_VALUES.map((value) => ({
                value,
                label: themeLabels[value],
              }))}
              value={themeValue}
              onValueChange={(val) =>
                val && handleThemeChange(val as ThemeValue)
              }
            >
              <SelectTrigger id={settingsControlId(themeId)} className="w-full">
                <SelectValue placeholder={themeLabels[themeValue]} />
              </SelectTrigger>
              <SelectContent>
                {THEME_VALUES.map((value) => {
                  const Icon = THEME_ICONS[value]
                  return (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4" />
                        <span>{themeLabels[value]}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          }
        />
      </SettingsList>
    </SettingsSection>
  )
}
