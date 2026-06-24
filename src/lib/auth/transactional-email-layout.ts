const BRAND = {
  pageBg: '#f4f6f5',
  cardBg: '#ffffff',
  text: '#1f2937',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  accent: '#0d9488',
  accentDark: '#0f766e',
  panelBg: '#f3f4f6',
  border: '#e5e7eb',
} as const

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type DetailRow = {
  label: string
  value: string
  emphasize?: boolean
}

function buildBrandMark(appName: string): string {
  return `
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:${BRAND.accent};letter-spacing:-0.02em;">
      ${escapeHtml(appName)}
    </p>
  `.trim()
}

type TransactionalEmailOptions = {
  appName: string
  previewText: string
  title: string
  intro: string
  detailsTitle?: string
  details: DetailRow[]
  cta: { label: string; href: string }
  footnote?: string
  messageCallout?: { author: string; body: string }
}

function buildDetailRows(rows: DetailRow[]): string {
  return rows
    .map((row, index) => {
      const isLast = index === rows.length - 1
      const border = isLast ? 'border-bottom:none;' : ''
      const rowPadding = isLast ? 'padding:8px 0 0;' : 'padding:10px 0;'
      const valueColor = row.emphasize ? BRAND.accent : BRAND.text
      const valueWeight = row.emphasize
        ? 'font-weight:700;'
        : 'font-weight:500;'

      return `
        <tr>
          <td style="${rowPadding}border-bottom:1px solid ${BRAND.border};${border}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">
                  ${escapeHtml(row.label)}
                </td>
                <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:${valueColor};${valueWeight}">
                  ${escapeHtml(row.value)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `.trim()
    })
    .join('')
}

function buildMessageCallout(author: string, body: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
      <tr>
        <td style="background-color:${BRAND.panelBg};border-radius:10px;padding:12px 14px;border-left:4px solid ${BRAND.accent};">
          <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;color:${BRAND.textMuted};font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">
            Message from ${escapeHtml(author)}
          </p>
          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;color:${BRAND.text};white-space:pre-wrap;">
            ${escapeHtml(body)}
          </p>
        </td>
      </tr>
    </table>
  `.trim()
}

export function buildTransactionalEmailHtml(
  options: TransactionalEmailOptions,
): string {
  const {
    appName,
    previewText,
    title,
    intro,
    detailsTitle = 'Details',
    details,
    cta,
    footnote,
    messageCallout,
  } = options

  const messageBlock = messageCallout
    ? buildMessageCallout(messageCallout.author, messageCallout.body)
    : ''

  const footnoteBlock = footnote
    ? `
      <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${BRAND.textMuted};text-align:center;">
        ${escapeHtml(footnote)}
      </p>
    `.trim()
    : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
    ${escapeHtml(previewText)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.pageBg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background-color:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding-bottom:24px;">
                    ${buildBrandMark(appName)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:32px;font-weight:700;color:${BRAND.text};">
                      ${escapeHtml(title)}
                    </h1>
                    <p style="margin:0 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:${BRAND.textMuted};">
                      ${intro}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;background-color:${BRAND.panelBg};border-radius:10px;">
                <tr>
                  <td style="padding:12px 16px 10px;">
                    <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;color:${BRAND.textMuted};font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">
                      ${escapeHtml(detailsTitle)}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      ${buildDetailRows(details)}
                    </table>
                  </td>
                </tr>
              </table>

              ${messageBlock}

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:${BRAND.accent};">
                    <a href="${escapeHtml(cta.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:${BRAND.accent};">
                      ${escapeHtml(cta.label)}
                    </a>
                  </td>
                </tr>
              </table>

              ${footnoteBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid ${BRAND.border};background-color:#fafafa;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${BRAND.textSubtle};text-align:center;">
                Sent by ${escapeHtml(appName)} · Keep your friendships balanced.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
