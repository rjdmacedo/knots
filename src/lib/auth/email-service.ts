/**
 * Email Service — handles email composition and delivery via Resend.
 * Sends verification, password reset, group invitation, and friend invite emails.
 * Uses dynamic import to avoid loading Resend at build time.
 */

import {
  buildTransactionalEmailHtml,
  escapeHtml,
} from '@/lib/auth/transactional-email-layout'
import type { Resend } from 'resend'

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
}

const APP_NAME = 'Knots'

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
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

  return `
    <h1>Verify your email for ${APP_NAME}</h1>
    <p>Welcome to ${APP_NAME}! Please verify your email address to complete your registration.</p>
    <p>Click the link below to verify your email:</p>
    <p><a href="${verificationLink}">Verify Email</a></p>
    <p>This link will expire in 24 hours.</p>
    <p>If you did not create an account, you can safely ignore this email.</p>
  `.trim()
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

export function buildPasswordResetEmailHtml(token: string): string {
  const baseUrl = getBaseUrl()
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  return `
    <h1>Reset your password for ${APP_NAME}</h1>
    <p>You requested a password reset for your ${APP_NAME} account.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="${resetLink}">Reset Password</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  `.trim()
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
  return `
    <h1>You've been invited to join a group on ${APP_NAME}</h1>
    <p>You have been invited to join the group "${groupName}" on ${APP_NAME}.</p>
    <p>Click the link below to accept the invitation:</p>
    <p><a href="${inviteLink}">Join Group</a></p>
    <p>This invitation will expire in 7 days.</p>
    <p>If you did not expect this invitation, you can safely ignore this email.</p>
  `.trim()
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
  if (hasAccount) {
    return `
    <h1>${inviterName} added you on ${APP_NAME}</h1>
    <p>${inviterName} added you to their friends on ${APP_NAME} — a simple way to share expenses with friends and family.</p>
    <p>Sign in to connect:</p>
    <p><a href="${inviteLink}">Open ${APP_NAME}</a></p>
    <p>If you do not know ${inviterName}, you can safely ignore this email.</p>
  `.trim()
  }

  return `
    <h1>Connect with ${inviterName} on ${APP_NAME}</h1>
    <p>${inviterName} added you to their friends on ${APP_NAME} — a simple way to share expenses with friends and family.</p>
    <p>Create your free account to connect:</p>
    <p><a href="${inviteLink}">Join ${APP_NAME}</a></p>
    <p>If you do not know ${inviterName}, you can safely ignore this email.</p>
  `.trim()
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
    ? `<strong style="color:#1f2937;">${safeRequester}</strong> is requesting <strong style="color:#0d9488;">${safeAmount}</strong> for your direct balance.`
    : `<strong style="color:#1f2937;">${safeRequester}</strong> is requesting <strong style="color:#0d9488;">${safeAmount}</strong> for your balance in the group <strong style="color:#1f2937;">${safeGroup}</strong>.`

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
    ? `<strong style="color:#1f2937;">${safePayer}</strong> recorded a payment of <strong style="color:#0d9488;">${safeAmount}</strong> for your direct balance.`
    : `<strong style="color:#1f2937;">${safePayer}</strong> recorded a payment of <strong style="color:#0d9488;">${safeAmount}</strong> in the group <strong style="color:#1f2937;">${safeGroup}</strong>.`

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
    intro: `${intro} <strong style="color:${isFullySettled ? '#0d9488' : '#1f2937'};">${safeRemainingBalance}</strong>.`,
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
  }
}

/** Singleton email service instance */
export const emailService: EmailService = createEmailService()
