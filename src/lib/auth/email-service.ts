/**
 * Email Service — handles email composition and delivery via Resend.
 * Sends verification, password reset, and invitation emails.
 * Uses dynamic import to avoid loading Resend at build time.
 */

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
  }
}

/** Singleton email service instance */
export const emailService: EmailService = createEmailService()
