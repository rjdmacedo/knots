'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { Info } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

export type DecompositionBannerNonMember = {
  userId: string
  name: string
  /** Amount in major units (e.g. 33.33 for 33.33 €) */
  amountMajor: number
}

export type DecompositionBannerProps = {
  nonMembers: DecompositionBannerNonMember[]
  /** Amount in major units (e.g. 66.67 for 66.67 €) */
  groupHalfAmountMajor: number
  currency: Currency
  /** The group name used for interpolation in the nonMemberLine i18n key */
  groupName: string
}

/**
 * Inline banner shown in the ExpenseForm when one or more non-members are
 * present in paidFor. Explains which shares will become Direct_Halves and
 * what the Group_Half amount will be.
 *
 * Returns null when there are no non-members or all their amounts are zero.
 */
export function DecompositionBanner({
  nonMembers,
  groupHalfAmountMajor,
  currency,
  groupName,
}: DecompositionBannerProps) {
  const t = useTranslations('ExpenseForm.decompositionBanner')
  const locale = useLocale()

  const visibleNonMembers = nonMembers.filter((nm) => nm.amountMajor > 0)

  if (visibleNonMembers.length === 0) {
    return null
  }

  return (
    <Alert>
      <Info />
      <AlertTitle>{t('postSaveTitle')}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {visibleNonMembers.map((nm) => (
            <li key={nm.userId}>
              {t('nonMemberLine', {
                name: nm.name,
                group: groupName,
                amount: formatCurrency(currency, nm.amountMajor, locale, true),
              })}
            </li>
          ))}
          {groupHalfAmountMajor > 0 && (
            <li>
              {t('groupHalfLine', {
                amount: formatCurrency(
                  currency,
                  groupHalfAmountMajor,
                  locale,
                  true,
                ),
              })}
            </li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
