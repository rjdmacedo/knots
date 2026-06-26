'use client'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { getCurrency } from '@/lib/currency'
import type { TimelineEntry, TimelinePayment } from '@/lib/friend-timeline'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Package,
  Receipt,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type FriendTimelineProps = {
  entries: TimelineEntry[]
  currentUserId: string
  friendUsername: string
}

/** A displayable row — either a single entry or a bundle of payments */
type DisplayRow =
  | { kind: 'single'; entry: TimelineEntry }
  | { kind: 'bundle'; bundleId: string; payments: TimelinePayment[] }

// ─── Main Component ──────────────────────────────────────────────────────────

export function FriendTimeline({
  entries,
  currentUserId,
  friendUsername,
}: FriendTimelineProps) {
  const t = useTranslations('Friends.Timeline')

  const rows = useMemo(() => groupEntriesIntoBundles(entries), [entries])

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t('empty')}
      </p>
    )
  }

  return (
    <div className="flex flex-col divide-y">
      {rows.map((row, index) => {
        if (row.kind === 'bundle') {
          return (
            <BundleRow
              key={`bundle-${row.bundleId}`}
              bundleId={row.bundleId}
              payments={row.payments}
              currentUserId={currentUserId}
              friendUsername={friendUsername}
            />
          )
        }

        const entry = row.entry
        switch (entry.type) {
          case 'GROUP_SUMMARY':
            return (
              <GroupSummaryRow key={`group-${entry.groupId}`} entry={entry} />
            )
          case 'EXPENSE':
            return (
              <TimelineExpenseRow
                key={`expense-${entry.expenseId}`}
                entry={entry}
                currentUserId={currentUserId}
              />
            )
          case 'PAYMENT':
            return (
              <PaymentTimelineRow
                key={`payment-${entry.expenseId}-${index}`}
                entry={entry}
                friendUsername={friendUsername}
              />
            )
        }
      })}
    </div>
  )
}

// ─── Row Components ──────────────────────────────────────────────────────────

function GroupSummaryRow({
  entry,
}: {
  entry: TimelineEntry & { type: 'GROUP_SUMMARY' }
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Friends.Timeline')

  const currency = getCurrency(entry.currency)
  const formattedBalance = formatCurrency(
    currency,
    Math.abs(entry.balanceAmount),
    locale,
  )

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
      onClick={() => router.push(`/groups/${entry.groupId}`)}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
        <Users className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.groupName}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(entry.activityDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {entry.isSettled ? (
          <Badge variant="secondary">{t('groupSettled')}</Badge>
        ) : (
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              entry.balanceAmount > 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {entry.balanceAmount > 0 ? '+' : '-'}
            {formattedBalance}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  )
}

function TimelineExpenseRow({
  entry,
  currentUserId,
}: {
  entry: TimelineEntry & { type: 'EXPENSE' }
  currentUserId: string
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Friends.Timeline')

  const currency = getCurrency(entry.currency)
  const formattedShare = formatCurrency(
    currency,
    Math.abs(entry.userShare),
    locale,
  )

  // Determine lent vs borrowed
  const shareLabel =
    entry.userShare > 0
      ? t('youLent', { amount: formattedShare })
      : entry.userShare < 0
        ? t('youBorrowed', { amount: formattedShare })
        : null

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors"
      onClick={() =>
        router.push(`/groups/direct/expenses/${entry.expenseId}/edit`)
      }
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
        <Receipt className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.title}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(entry.expenseDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {shareLabel && (
          <span
            className={cn(
              'text-sm tabular-nums',
              entry.userShare > 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {shareLabel}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  )
}

function PaymentTimelineRow({
  entry,
  friendUsername,
}: {
  entry: TimelineEntry & { type: 'PAYMENT' }
  friendUsername: string
}) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Friends.Timeline')

  const currency = getCurrency(entry.currency)
  const formattedAmount = formatCurrency(currency, entry.amount, locale)

  const label = t('paid', {
    payer: entry.fromUserName,
    payee: entry.toUserName,
    amount: formattedAmount,
  })

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors italic"
      onClick={() =>
        router.push(`/friends/${friendUsername}/payments/${entry.expenseId}`)
      }
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
        <Banknote className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{label}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(entry.expenseDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  )
}

// ─── Bundle Row (grouped debt consolidation payments) ────────────────────────

function BundleRow({
  bundleId,
  payments,
  currentUserId,
  friendUsername,
}: {
  bundleId: string
  payments: TimelinePayment[]
  currentUserId: string
  friendUsername: string
}) {
  const [open, setOpen] = useState(false)
  const locale = useLocale()
  const t = useTranslations('Friends.SettleAll')

  // All payments in a bundle share the same currency
  const currency = getCurrency(payments[0].currency)
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const formattedTotal = formatCurrency(currency, totalAmount, locale)
  const date = payments[0].expenseDate

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors cursor-pointer">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
            <Package className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">
              {t('timelineLabel', { amount: formattedTotal })}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(date, locale, { dateStyle: 'medium' })}
            </div>
          </div>

          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-11 border-l-2 border-muted ml-7 divide-y">
          {payments.map((payment) => (
            <BundleSubRow
              key={payment.expenseId}
              payment={payment}
              friendUsername={friendUsername}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function BundleSubRow({
  payment,
  friendUsername,
}: {
  payment: TimelinePayment
  friendUsername: string
}) {
  const router = useRouter()
  const locale = useLocale()

  const currency = getCurrency(payment.currency)
  const formattedAmount = formatCurrency(currency, payment.amount, locale)

  const label = payment.groupName ?? 'Direct'

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-accent transition-colors text-sm"
      onClick={() =>
        router.push(`/friends/${friendUsername}/payments/${payment.expenseId}`)
      }
    >
      <span className="text-muted-foreground truncate">{label}:</span>
      <span className="tabular-nums font-medium">{formattedAmount}</span>
      <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Groups consecutive payments with the same bundleId into a single display row.
 * Non-bundled entries remain as single rows.
 */
function groupEntriesIntoBundles(entries: TimelineEntry[]): DisplayRow[] {
  const rows: DisplayRow[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    // Check if this is a payment with a bundleId
    if (entry.type === 'PAYMENT' && entry.bundleId) {
      const bundleId = entry.bundleId

      // Look ahead for consecutive payments with the same bundleId
      const bundlePayments: TimelinePayment[] = [entry]
      while (i + 1 < entries.length) {
        const next = entries[i + 1]
        if (next.type === 'PAYMENT' && next.bundleId === bundleId) {
          bundlePayments.push(next)
          i++
        } else {
          break
        }
      }

      // Only group if there are 2+ payments in the bundle
      if (bundlePayments.length >= 2) {
        rows.push({ kind: 'bundle', bundleId, payments: bundlePayments })
      } else {
        // Single payment with a bundleId — show as normal row
        rows.push({ kind: 'single', entry: bundlePayments[0] })
      }
    } else {
      rows.push({ kind: 'single', entry })
    }
  }

  return rows
}
