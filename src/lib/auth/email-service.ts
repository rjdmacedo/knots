/**
 * Email Service — handles email composition and delivery via Resend.
 * Sends verification, password reset, group invitation, and friend invite emails.
 * Uses dynamic import to avoid loading Resend at build time.
 */

import {
  buildSimpleEmailHtml,
  buildTransactionalEmailHtml,
  EMAIL_LOGO_CID,
  escapeHtml,
  type SimpleEmailOptions,
} from '@/lib/auth/transactional-email-layout'
import type { Resend } from 'resend'
import { EMAIL_LOGO_BASE64 } from './email-logo-data'

export interface EmailService {
  sendVerificationEmail(
    to: string,
    token: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendPasswordResetEmail(
    to: string,
    token: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendInvitationEmail(
    to: string,
    groupName: string,
    inviteLink: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendAddedToGroupEmail(
    to: string,
    groupName: string,
    groupLink: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendFriendInviteEmail(
    to: string,
    inviterName: string,
    inviteLink: string,
    hasAccount: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendPaymentRequestEmail(
    to: string,
    requesterName: string,
    groupName: string,
    amount: string,
    balancesLink: string,
    message?: string,
    isDirectBalance?: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendSettlementRecordedEmail(
    to: string,
    payerName: string,
    groupName: string,
    amount: string,
    balancesLink: string,
    remainingBalance: string,
    isDirectBalance?: boolean,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendGroupActivityDigestEmail(
    to: string,
    actorName: string,
    groupName: string,
    activityLink: string,
    expenseTitle?: string,
    activityType?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendEmailChangeCodeEmail(
    to: string,
    code: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendMagicLinkEmail(
    to: string,
    token: string,
    callbackUrl?: string | null,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  sendPasswordRemovedEmail(
    to: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
}

const APP_NAME = 'Knots'

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

function buildAuthEmailHtml(
  options: Omit<SimpleEmailOptions, 'appName'>,
): string {
  return buildSimpleEmailHtml({
    ...options,
    appName: APP_NAME,
  })
}

let emailLogoBytes: Buffer | undefined

/** Inline logo so mail clients do not have to fetch the app server. */
function emailLogoAttachment() {
  emailLogoBytes ??= Buffer.from(EMAIL_LOGO_BASE64, 'base64')
  return {
    filename: 'logo.png',
    content: emailLogoBytes,
    contentType: 'image/png',
    contentId: EMAIL_LOGO_CID,
  }
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'onboarding@resend.dev'
}

let resendClient: Resend | null = null

async function getResendClient(): Promise<Resend> {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('[EmailService] RESEND_API_KEY is not set.')
    }
    const { Resend } = await import('resend')
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export function buildVerificationEmailHtml(token: string): string {
  const baseUrl = getBaseUrl()
  const verificationLink = `${baseUrl}/verify-email?token=${token}`

  return buildAuthEmailHtml({
    previewText: `Verify your email for ${APP_NAME}`,
    title: 'Verify your email',
    intro: `Welcome to ${APP_NAME}. Confirm this address to finish creating your account. This link expires in 24 hours.`,
    cta: { label: 'Verify email', href: verificationLink },
    footnote:
      'If you did not create an account, you can safely ignore this email.',
  })
}

export function buildVerificationEmailText(token: string): string {
  const baseUrl = getBaseUrl()
  const verificationLink = `${baseUrl}/verify-email?token=${token}`

  return [
    `Verify your email for ${APP_NAME}`,
    '',
    `Welcome to ${APP_NAME}! Please verify your email address to complete your registration.`,
    '',
    `Click the link below to verify your email:`,
    verificationLink,
    '',
    `This link will expire in 24 hours.`,
    '',
    `If you did not create an account, you can safely ignore this email.`,
  ].join('\n')
}

export function buildMagicLinkEmailHtml(
  token: string,
  callbackUrl?: string | null,
): string {
  const baseUrl = getBaseUrl()
  const params = new URLSearchParams({ token })
  if (callbackUrl) params.set('callbackUrl', callbackUrl)
  const link = `${baseUrl}/login/magic?${params.toString()}`

  return buildAuthEmailHtml({
    previewText: `Sign in to ${APP_NAME}`,
    title: 'Sign in',
    intro: `Use the button below to sign in to your ${APP_NAME} account. It works once and expires in 15 minutes.`,
    cta: { label: 'Sign in', href: link },
    footnote: 'If you did not request this email, you can safely ignore it.',
  })
}

export function buildMagicLinkEmailText(
  token: string,
  callbackUrl?: string | null,
): string {
  const baseUrl = getBaseUrl()
  const params = new URLSearchParams({ token })
  if (callbackUrl) params.set('callbackUrl', callbackUrl)
  const link = `${baseUrl}/login/magic?${params.toString()}`

  return [
    `Sign in to ${APP_NAME}`,
    '',
    `Use the link below to sign in to your ${APP_NAME} account. It works once and expires in 15 minutes.`,
    link,
    '',
    `If you did not request this email, you can safely ignore it.`,
  ].join('\n')
}

export function buildPasswordRemovedEmailHtml(): string {
  return buildAuthEmailHtml({
    previewText: `Your ${APP_NAME} password was removed`,
    title: 'Password removed',
    intro: `You can still sign in with an email link or a passkey.`,
    cta: { label: 'Sign in', href: `${getBaseUrl()}/login` },
    footnote:
      'If you did not remove your password, reset it from the sign-in page.',
  })
}

export function buildPasswordRemovedEmailText(): string {
  return [
    `Your ${APP_NAME} password was removed`,
    '',
    `You can still sign in with an email link or a passkey.`,
    '',
    `If you did not remove your password, reset it from the sign-in page.`,
  ].join('\n')
}

export function buildPasswordResetEmailHtml(token: string): string {
  const baseUrl = getBaseUrl()
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  return buildAuthEmailHtml({
    previewText: `Reset your password for ${APP_NAME}`,
    title: 'Reset your password',
    intro: `You requested a password reset for your ${APP_NAME} account. This link expires in 1 hour.`,
    cta: { label: 'Reset password', href: resetLink },
    footnote:
      'If you did not request a password reset, you can safely ignore this email.',
  })
}

export function buildPasswordResetEmailText(token: string): string {
  const baseUrl = getBaseUrl()
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  return [
    `Reset your password for ${APP_NAME}`,
    '',
    `You requested a password reset for your ${APP_NAME} account.`,
    '',
    `Click the link below to set a new password:`,
    resetLink,
    '',
    `This link will expire in 1 hour.`,
    '',
    `If you did not request a password reset, you can safely ignore this email.`,
  ].join('\n')
}

export function buildInvitationEmailHtml(
  groupName: string,
  inviteLink: string,
): string {
  return buildAuthEmailHtml({
    previewText: `You've been invited to join ${groupName} on ${APP_NAME}`,
    title: `Join ${groupName}`,
    intro: `You have been invited to join this group on ${APP_NAME}. This invitation expires in 7 days.`,
    cta: { label: 'Join group', href: inviteLink },
    footnote:
      'If you did not expect this invitation, you can safely ignore this email.',
  })
}

export function buildAddedToGroupEmailHtml(
  groupName: string,
  groupLink: string,
): string {
  return buildAuthEmailHtml({
    previewText: `You've been added to ${groupName} on ${APP_NAME}`,
    title: `Welcome to ${groupName}`,
    intro: `You have been added to this group on ${APP_NAME}.`,
    cta: { label: 'Open group', href: groupLink },
  })
}

export function buildAddedToGroupEmailText(
  groupName: string,
  groupLink: string,
): string {
  return [
    `You've been added to "${groupName}" on ${APP_NAME}`,
    '',
    'Open the group:',
    groupLink,
  ].join('\n')
}

export function buildInvitationEmailText(
  groupName: string,
  inviteLink: string,
): string {
  return [
    `You've been invited to join a group on ${APP_NAME}`,
    '',
    `You have been invited to join the group "${groupName}" on ${APP_NAME}.`,
    '',
    `Click the link below to accept the invitation:`,
    inviteLink,
    '',
    `This invitation will expire in 7 days.`,
    '',
    `If you did not expect this invitation, you can safely ignore this email.`,
  ].join('\n')
}

export function buildFriendInviteEmailHtml(
  inviterName: string,
  inviteLink: string,
  hasAccount: boolean,
): string {
  return buildAuthEmailHtml({
    previewText: hasAccount
      ? `${inviterName} added you on ${APP_NAME}`
      : `Connect with ${inviterName} on ${APP_NAME}`,
    title: hasAccount
      ? `${inviterName} added you`
      : `Connect with ${inviterName}`,
    intro: `${inviterName} added you to their friends on ${APP_NAME}, a simple way to share expenses with friends and family.`,
    cta: {
      label: hasAccount ? `Open ${APP_NAME}` : `Join ${APP_NAME}`,
      href: inviteLink,
    },
    footnote: `If you do not know ${inviterName}, you can safely ignore this email.`,
  })
}

export function buildFriendInviteEmailText(
  inviterName: string,
  inviteLink: string,
  hasAccount: boolean,
): string {
  if (hasAccount) {
    return [
      `${inviterName} added you on ${APP_NAME}`,
      '',
      `${inviterName} added you to their friends on ${APP_NAME} — a simple way to share expenses with friends and family.`,
      '',
      `Sign in to connect:`,
      inviteLink,
      '',
      `If you do not know ${inviterName}, you can safely ignore this email.`,
    ].join('\n')
  }

  return [
    `Connect with ${inviterName} on ${APP_NAME}`,
    '',
    `${inviterName} added you to their friends on ${APP_NAME} — a simple way to share expenses with friends and family.`,
    '',
    `Create your free account to connect:`,
    inviteLink,
    '',
    `If you do not know ${inviterName}, you can safely ignore this email.`,
  ].join('\n')
}

export function buildPaymentRequestEmailHtml(
  requesterName: string,
  groupName: string,
  amount: string,
  balancesLink: string,
  message?: string,
  isDirectBalance = false,
): string {
  const trimmedMessage = message?.trim()
  const safeRequester = escapeHtml(requesterName)
  const safeGroup = escapeHtml(groupName)
  const safeAmount = escapeHtml(amount)

  const previewText = isDirectBalance
    ? `${requesterName} is requesting ${amount} from you`
    : `${requesterName} is requesting ${amount} in ${groupName}`

  const intro = isDirectBalance
    ? `<strong style="color:#09090b;">${safeRequester}</strong> is requesting <strong style="color:#007595;">${safeAmount}</strong> for your direct balance.`
    : `<strong style="color:#09090b;">${safeRequester}</strong> is requesting <strong style="color:#007595;">${safeAmount}</strong> for your balance in the group <strong style="color:#09090b;">${safeGroup}</strong>.`

  const details = isDirectBalance
    ? [
        { label: 'Requested by', value: requesterName },
        { label: 'Amount', value: amount, emphasize: true },
      ]
    : [
        { label: 'Group', value: groupName },
        { label: 'Requested by', value: requesterName },
        { label: 'Amount', value: amount, emphasize: true },
      ]

  return buildTransactionalEmailHtml({
    appName: APP_NAME,
    previewText,
    title: 'Payment request',
    intro,
    detailsTitle: 'Request details',
    details,
    messageCallout: trimmedMessage
      ? { author: requesterName, body: trimmedMessage }
      : undefined,
    cta: { label: 'View balances', href: balancesLink },
    footnote: `If you already paid outside ${APP_NAME}, you can record the payment there.`,
  })
}

export function buildPaymentRequestEmailSubject(
  requesterName: string,
  groupName: string,
  amount: string,
  isDirectBalance = false,
): string {
  if (isDirectBalance) {
    return `${requesterName} requested ${amount} from you on ${APP_NAME}`
  }

  return `${requesterName} requested ${amount} in "${groupName}" on ${APP_NAME}`
}

export function buildPaymentRequestEmailText(
  requesterName: string,
  groupName: string,
  amount: string,
  balancesLink: string,
  message?: string,
  isDirectBalance = false,
): string {
  const summary = isDirectBalance
    ? `${requesterName} is requesting ${amount} for your direct balance.`
    : `${requesterName} is requesting ${amount} in the group "${groupName}".`

  const lines = [`Payment request on ${APP_NAME}`, '', summary]

  if (message?.trim()) {
    lines.push('', `Message from ${requesterName}: ${message.trim()}`)
  }

  lines.push(
    '',
    'Open the group balances to record your payment:',
    balancesLink,
    '',
    `If you have already paid outside ${APP_NAME}, you can record the payment there.`,
  )

  return lines.join('\n')
}

export function buildSettlementRecordedEmailHtml(
  payerName: string,
  groupName: string,
  amount: string,
  balancesLink: string,
  remainingBalance: string,
  isDirectBalance = false,
): string {
  const safePayer = escapeHtml(payerName)
  const safeGroup = escapeHtml(groupName)
  const safeAmount = escapeHtml(amount)
  const safeRemainingBalance = escapeHtml(remainingBalance)
  const isFullySettled = remainingBalance === 'All settled'

  const previewText = isDirectBalance
    ? `${payerName} recorded a ${amount} payment to you — ${remainingBalance}`
    : `${payerName} recorded a ${amount} payment in ${groupName} — ${remainingBalance}`

  const intro = isDirectBalance
    ? `<strong style="color:#09090b;">${safePayer}</strong> recorded a payment of <strong style="color:#007595;">${safeAmount}</strong> for your direct balance.`
    : `<strong style="color:#09090b;">${safePayer}</strong> recorded a payment of <strong style="color:#007595;">${safeAmount}</strong> in the group <strong style="color:#09090b;">${safeGroup}</strong>.`

  const details = isDirectBalance
    ? [
        { label: 'Paid by', value: payerName },
        { label: 'Amount', value: amount, emphasize: true },
        {
          label: 'Remaining balance',
          value: remainingBalance,
          emphasize: true,
        },
      ]
    : [
        { label: 'Group', value: groupName },
        { label: 'Paid by', value: payerName },
        { label: 'Amount', value: amount, emphasize: true },
        {
          label: 'Remaining balance',
          value: remainingBalance,
          emphasize: true,
        },
      ]

  return buildTransactionalEmailHtml({
    appName: APP_NAME,
    previewText,
    title: 'Payment recorded',
    intro: `${intro} <strong style="color:${isFullySettled ? '#007595' : '#09090b'};">${safeRemainingBalance}</strong>.`,
    detailsTitle: 'Payment details',
    details,
    cta: { label: 'View balances', href: balancesLink },
    footnote: isFullySettled
      ? `You're all settled in ${APP_NAME}.`
      : `Review the updated balance in ${APP_NAME}.`,
  })
}

export function buildSettlementRecordedEmailSubject(
  payerName: string,
  groupName: string,
  amount: string,
  isDirectBalance = false,
): string {
  if (isDirectBalance) {
    return `${payerName} recorded a ${amount} payment to you on ${APP_NAME}`
  }

  return `${payerName} recorded a ${amount} payment in "${groupName}" on ${APP_NAME}`
}

export function buildSettlementRecordedEmailText(
  payerName: string,
  groupName: string,
  amount: string,
  balancesLink: string,
  remainingBalance: string,
  isDirectBalance = false,
): string {
  const summary = isDirectBalance
    ? `${payerName} recorded a payment of ${amount} for your direct balance.`
    : `${payerName} recorded a payment of ${amount} in the group "${groupName}".`

  return [
    `Payment recorded on ${APP_NAME}`,
    '',
    summary,
    `Remaining balance: ${remainingBalance}`,
    '',
    'View balances:',
    balancesLink,
  ].join('\n')
}

export function buildGroupActivityDigestEmailHtml(
  actorName: string,
  groupName: string,
  activityLink: string,
  expenseTitle?: string,
  activityType?: string,
): string {
  const safeActor = escapeHtml(actorName)
  const safeGroup = escapeHtml(groupName)
  const safeExpense = expenseTitle ? escapeHtml(expenseTitle) : ''
  const action =
    activityType === 'DELETE_EXPENSE'
      ? 'deleted'
      : activityType === 'UPDATE_EXPENSE'
        ? 'updated'
        : activityType === 'CREATE_RECURRING_EXPENSE'
          ? 'created the recurring expense'
          : 'added'
  const intro = safeExpense
    ? `<strong style="color:#09090b;">${safeActor}</strong> ${action} <strong style="color:#09090b;">${safeExpense}</strong> in <strong style="color:#09090b;">${safeGroup}</strong>.`
    : `<strong style="color:#09090b;">${safeActor}</strong> made changes in the group <strong style="color:#09090b;">${safeGroup}</strong>.`

  return buildTransactionalEmailHtml({
    appName: APP_NAME,
    previewText: expenseTitle
      ? `${actorName} ${action} ${expenseTitle} in ${groupName}`
      : `${actorName} made changes in ${groupName}`,
    title: 'Group activity',
    intro,
    detailsTitle: 'Activity',
    details: [
      { label: 'Changed by', value: actorName },
      { label: 'Group', value: groupName },
    ],
    cta: { label: 'View activity', href: activityLink },
  })
}

export function buildGroupActivityDigestEmailSubject(
  actorName: string,
  groupName: string,
  expenseTitle?: string,
): string {
  if (expenseTitle) {
    return `${actorName}: "${expenseTitle}" in "${groupName}" on ${APP_NAME}`
  }
  return `${actorName} made changes in "${groupName}" on ${APP_NAME}`
}

export function buildGroupActivityDigestEmailText(
  actorName: string,
  groupName: string,
  activityLink: string,
  expenseTitle?: string,
  activityType?: string,
): string {
  const action =
    activityType === 'DELETE_EXPENSE'
      ? 'deleted'
      : activityType === 'UPDATE_EXPENSE'
        ? 'updated'
        : activityType === 'CREATE_RECURRING_EXPENSE'
          ? 'created the recurring expense'
          : 'added'
  return [
    `Group activity on ${APP_NAME}`,
    '',
    expenseTitle
      ? `${actorName} ${action} "${expenseTitle}" in the group "${groupName}".`
      : `${actorName} made changes in the group "${groupName}".`,
    '',
    'View activity:',
    activityLink,
  ].join('\n')
}

export function buildEmailChangeCodeEmailHtml(code: string): string {
  return buildAuthEmailHtml({
    previewText: `Confirm your new email for ${APP_NAME}`,
    title: 'Confirm your new email',
    intro: `Use this code to confirm the new address for your ${APP_NAME} account. It expires in 15 minutes.`,
    code,
    footnote:
      'If you did not request an email change, you can safely ignore this email and your address will stay the same.',
  })
}

export function buildEmailChangeCodeEmailText(code: string): string {
  return [
    `Confirm your new email for ${APP_NAME}`,
    '',
    `Use the code below to confirm this address as the new email for your ${APP_NAME} account.`,
    '',
    code,
    '',
    `This code will expire in 15 minutes.`,
    '',
    `If you did not request an email change, you can safely ignore this email and your address will stay the same.`,
  ].join('\n')
}

function createEmailService(): EmailService {
  return {
    async sendVerificationEmail(to, token) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `Verify your email for ${APP_NAME}`
      const html = buildVerificationEmailHtml(token)
      const text = buildVerificationEmailText(token)

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send verification email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send verification email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendPasswordResetEmail(to, token) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `Reset your password for ${APP_NAME}`
      const html = buildPasswordResetEmailHtml(token)
      const text = buildPasswordResetEmailText(token)

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send password reset email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send password reset email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendInvitationEmail(to, groupName, inviteLink) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `You've been invited to join "${groupName}" on ${APP_NAME}`
      const html = buildInvitationEmailHtml(groupName, inviteLink)
      const text = buildInvitationEmailText(groupName, inviteLink)

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send invitation email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send invitation email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendAddedToGroupEmail(to, groupName, groupLink) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `You've been added to "${groupName}" on ${APP_NAME}`

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html: buildAddedToGroupEmailHtml(groupName, groupLink),
          text: buildAddedToGroupEmailText(groupName, groupLink),
          attachments: [emailLogoAttachment()],
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown email delivery error',
        }
      }
    },

    async sendFriendInviteEmail(to, inviterName, inviteLink, hasAccount) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `${inviterName} wants to connect with you on ${APP_NAME}`
      const html = buildFriendInviteEmailHtml(
        inviterName,
        inviteLink,
        hasAccount,
      )
      const text = buildFriendInviteEmailText(
        inviterName,
        inviteLink,
        hasAccount,
      )

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send friend invite email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send friend invite email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendPaymentRequestEmail(
      to,
      requesterName,
      groupName,
      amount,
      balancesLink,
      message,
      isDirectBalance,
    ) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = buildPaymentRequestEmailSubject(
        requesterName,
        groupName,
        amount,
        isDirectBalance,
      )
      const html = buildPaymentRequestEmailHtml(
        requesterName,
        groupName,
        amount,
        balancesLink,
        message,
        isDirectBalance,
      )
      const text = buildPaymentRequestEmailText(
        requesterName,
        groupName,
        amount,
        balancesLink,
        message,
        isDirectBalance,
      )

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send payment request email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send payment request email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendSettlementRecordedEmail(
      to,
      payerName,
      groupName,
      amount,
      balancesLink,
      remainingBalance,
      isDirectBalance,
    ) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = buildSettlementRecordedEmailSubject(
        payerName,
        groupName,
        amount,
        isDirectBalance,
      )
      const html = buildSettlementRecordedEmailHtml(
        payerName,
        groupName,
        amount,
        balancesLink,
        remainingBalance,
        isDirectBalance,
      )
      const text = buildSettlementRecordedEmailText(
        payerName,
        groupName,
        amount,
        balancesLink,
        remainingBalance,
        isDirectBalance,
      )

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send settlement recorded email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send settlement recorded email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendGroupActivityDigestEmail(
      to,
      actorName,
      groupName,
      activityLink,
      expenseTitle,
      activityType,
    ) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = buildGroupActivityDigestEmailSubject(
        actorName,
        groupName,
        expenseTitle,
      )
      const html = buildGroupActivityDigestEmailHtml(
        actorName,
        groupName,
        activityLink,
        expenseTitle,
        activityType,
      )
      const text = buildGroupActivityDigestEmailText(
        actorName,
        groupName,
        activityLink,
        expenseTitle,
        activityType,
      )

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send group activity digest email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send group activity digest email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendEmailChangeCodeEmail(to, code) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `Confirm your new email for ${APP_NAME}`
      const html = buildEmailChangeCodeEmailHtml(code)
      const text = buildEmailChangeCodeEmailText(code)

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send email change code email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send email change code email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendMagicLinkEmail(to, token, callbackUrl) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `Sign in to ${APP_NAME}`
      const html = buildMagicLinkEmailHtml(token, callbackUrl)
      const text = buildMagicLinkEmailText(token, callbackUrl)

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send magic link email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send magic link email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },

    async sendPasswordRemovedEmail(to) {
      const resend = await getResendClient()
      const from = getFromAddress()
      const subject = `Your ${APP_NAME} password was removed`
      const html = buildPasswordRemovedEmailHtml()
      const text = buildPasswordRemovedEmailText()

      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text,
          attachments: [emailLogoAttachment()],
        })
        if (error) {
          console.error(
            `[EmailService] Failed to send password-removed email to ${to}:`,
            error,
          )
          return { ok: false, error: error.message }
        }
        return { ok: true }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown email delivery error'
        console.error(
          `[EmailService] Failed to send password-removed email to ${to}:`,
          message,
        )
        return { ok: false, error: message }
      }
    },
  }
}

/** Singleton email service instance */
export const emailService: EmailService = createEmailService()
