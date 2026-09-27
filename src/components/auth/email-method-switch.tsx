'use client'

import { FieldSeparator } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useTranslations } from 'next-intl'

export type EmailMethod = 'magic-link' | 'password'

export function EmailMethodSwitch({
  method,
  onMethodChange,
}: {
  method: EmailMethod
  onMethodChange: (method: EmailMethod) => void
}) {
  const t = useTranslations('Login')

  return (
    <div className="flex flex-col gap-4">
      <FieldSeparator className="text-xs tracking-wide [&_[data-slot=field-separator-content]]:bg-card">
        {t('orContinueWithEmail')}
      </FieldSeparator>
      <div className="rounded-lg bg-muted p-1">
        <ToggleGroup
          value={[method]}
          onValueChange={(value) => {
            const next = value[0]
            if (next === 'magic-link' || next === 'password') {
              onMethodChange(next)
            }
          }}
          spacing={0}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem
            value="magic-link"
            className="w-full aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
          >
            {t('methodMagicLink')}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="password"
            className="w-full aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
          >
            {t('methodPassword')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
