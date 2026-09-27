import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Loader2, type LucideIcon } from 'lucide-react'
import * as React from 'react'

/**
 * Presentational chrome for the account settings page.
 *
 * These components carry layout only: no data fetching, no tRPC, no state.
 * They mirror the structure of Spliit Cloud's `settings-ui.tsx`, built on the
 * Knots `Card` primitive and the `cn` helper. Do not import mutations here.
 */

/**
 * Derive the id of a row's control from the row id, so a `SettingsFieldRow`
 * label can point its `htmlFor` at the control the caller renders.
 */
export function settingsControlId(id: string): string {
  return `${id}-control`
}

interface SettingsSectionProps {
  /** Muted icon shown next to the title. */
  icon: LucideIcon
  /** Section heading rendered as an `h2`. */
  title: React.ReactNode
  /** Optional supporting copy under the title. */
  description?: React.ReactNode
  /** Optional header-right status (for example, `SettingsSaving`). */
  status?: React.ReactNode
  /** Optional footer, separated by a top border and bottom-aligned. */
  footer?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * A single settings card: muted icon, `h2` title, description, optional header
 * status, a divided body, and an optional bordered footer.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  status,
  footer,
  className,
  children,
}: SettingsSectionProps) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <Icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h2 className="text-lg leading-none font-medium">{title}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {children ? <CardContent className="px-0">{children}</CardContent> : null}
      {footer ? (
        <CardFooter className="flex-col items-end gap-3 border-t px-4 py-4 sm:px-6">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  )
}

interface SettingsGroupProps {
  /** Group heading rendered as an `h3`. */
  title: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * A titled subgroup inside a section: a tinted band with a primary accent bar
 * and an `h3`, followed by the group's rows.
 */
export function SettingsGroup({
  title,
  className,
  children,
}: SettingsGroupProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 bg-muted/30 px-4 py-2 sm:px-6">
        <span
          aria-hidden="true"
          className="h-4 w-1 rounded-full bg-primary/60"
        />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      {children}
    </div>
  )
}

/** A list of rows separated by hairline dividers. */
export function SettingsList({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('divide-y divide-border/70', className)} {...props}>
      {children}
    </div>
  )
}

interface SettingsRowProps {
  /** Optional row id, useful as an in-page anchor target. */
  id?: string
  /** Left column heading. */
  label: React.ReactNode
  /** Optional supporting copy under the label. */
  description?: React.ReactNode
  /** Right column control. */
  control?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * A row that stacks label above control below `sm` and places the control in a
 * right column from `sm` upward.
 */
export function SettingsRow({
  id,
  label,
  description,
  control,
  className,
  children,
}: SettingsRowProps) {
  const header = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {control ? <div className="shrink-0">{control}</div> : null}
    </>
  )

  // Extra content (for example the passkey list) sits under the label and
  // control, full width. Without this split it joins the `sm` row and ends up
  // beside the button.
  if (children) {
    return (
      <div
        id={id}
        className={cn('flex flex-col gap-3 px-4 py-4 sm:px-6', className)}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {header}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div
      id={id}
      className={cn(
        'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6',
        className,
      )}
    >
      {header}
    </div>
  )
}

interface SettingsFieldRowProps {
  /** Row id. The label points at `settingsControlId(id)`. */
  id: string
  /** Left column label. */
  label: React.ReactNode
  /** Optional supporting copy under the label. */
  description?: React.ReactNode
  /** Right column control. It should use `id={settingsControlId(id)}`. */
  control?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/**
 * Like `SettingsRow`, but the label is a `<label>` associated with the row's
 * control via `htmlFor`. Text controls are `w-full` below `sm` and
 * `sm:max-w-xs` from `sm` upward.
 */
export function SettingsFieldRow({
  id,
  label,
  description,
  control,
  className,
  children,
}: SettingsFieldRowProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6',
        className,
      )}
    >
      <div className="space-y-1">
        <label htmlFor={settingsControlId(id)} className="text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {control ? (
        <div className="w-full sm:w-auto sm:max-w-xs sm:shrink-0">
          {control}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** A small uppercase pill, exposed to assistive technology by default. */
export function SettingsBadge({
  className,
  children,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

interface SettingsSavingProps {
  /** Accessible saving text, announced to assistive technology. */
  label: string
  className?: string
}

/**
 * A live status indicator for in-flight autosaves: a spinner with an
 * `sr-only` label so screen readers announce the saving state.
 */
export function SettingsSaving({ label, className }: SettingsSavingProps) {
  return (
    <output
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </output>
  )
}

interface SettingsSectionSkeletonProps {
  icon: LucideIcon
  /** Number of skeleton rows to render. */
  rows?: number
  className?: string
}

/**
 * A loading placeholder that keeps the section header shape, so the page does
 * not swap to a centered spinner while a section loads.
 */
export function SettingsSectionSkeleton({
  icon: Icon,
  rows = 3,
  className,
}: SettingsSectionSkeletonProps) {
  return (
    <Card className={cn('gap-0 py-0', className)} aria-hidden="true">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-6">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <CardContent className="px-0">
        <div className="divide-y divide-border/70">
          {Array.from({ length: rows }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-9 w-full sm:w-40" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
