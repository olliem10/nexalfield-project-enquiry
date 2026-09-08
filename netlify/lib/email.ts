/**
 * The customer confirmation email.
 *
 * Two providers are supported and neither is required: if no mail credentials
 * are configured the send is recorded as "skipped" and the submission still
 * succeeds. Losing an email is a nuisance; losing a customer's questionnaire
 * because a mail server was down would not be.
 */
import nodemailer from 'nodemailer'
import { optionalEnv } from './http.ts'

export type EmailOutcome =
  | { status: 'sent'; provider: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export interface ConfirmationEmail {
  to: string
  customerName: string
  reference: string
}

const DEFAULT_FROM = 'NexalField <onboarding@nexalfield.com>'

export const CONFIRMATION_SUBJECT = 'NexalField Project Questionnaire Received'

export function confirmationText({ customerName, reference }: ConfirmationEmail): string {
  const name = customerName.trim() || 'there'
  return `Hi ${name},

Thank you for completing the NexalField Website Project Questionnaire.

We have successfully received your information and will begin reviewing your requirements.

Reference Number:
${reference}

We will contact you if we need any additional information.

Kind regards,
Ollie
NexalField`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Table-based layout with inline styles: it is the only thing Outlook and
 * Gmail both render predictably, and it degrades to readable plain text.
 */
export function confirmationHtml({ customerName, reference }: ConfirmationEmail): string {
  const name = escapeHtml(customerName.trim() || 'there')
  const ref = escapeHtml(reference)

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fbfaf8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e1d8;border-radius:10px;">
            <tr>
              <td style="padding:28px 32px 8px;border-bottom:1px solid #e6e1d8;">
                <p style="margin:0;font:600 13px/1.4 Helvetica,Arial,sans-serif;letter-spacing:0.12em;text-transform:uppercase;color:#245945;">NexalField</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;font:400 16px/1.6 Helvetica,Arial,sans-serif;color:#1d201e;">
                <p style="margin:0 0 18px;">Hi ${name},</p>
                <p style="margin:0 0 18px;">Thank you for completing the NexalField Website Project Questionnaire.</p>
                <p style="margin:0 0 24px;">We have successfully received your information and will begin reviewing your requirements.</p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f2ec;border:1px solid #e6e1d8;border-radius:10px;margin:0 0 24px;">
                  <tr>
                    <td style="padding:18px 20px;text-align:center;">
                      <p style="margin:0 0 6px;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:#6b716d;">Reference Number</p>
                      <p style="margin:0;font:600 22px/1.3 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.04em;color:#245945;">${ref}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 24px;">We will contact you if we need any additional information.</p>
                <p style="margin:0;">Kind regards,<br />Ollie<br />NexalField</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;border-top:1px solid #e6e1d8;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#6b716d;">
                Please quote ${ref} in any emails about your project.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function sendWithResend(
  apiKey: string,
  message: ConfirmationEmail,
): Promise<EmailOutcome> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: optionalEnv('EMAIL_FROM') ?? DEFAULT_FROM,
      to: [message.to],
      subject: CONFIRMATION_SUBJECT,
      text: confirmationText(message),
      html: confirmationHtml(message),
      ...(optionalEnv('EMAIL_REPLY_TO') ? { reply_to: optionalEnv('EMAIL_REPLY_TO') } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return {
      status: 'failed',
      error: `Resend responded ${response.status}: ${detail.slice(0, 300)}`,
    }
  }

  return { status: 'sent', provider: 'resend' }
}

async function sendWithSmtp(message: ConfirmationEmail): Promise<EmailOutcome> {
  const host = optionalEnv('SMTP_HOST')
  if (!host) return { status: 'skipped', reason: 'No email provider configured' }

  const port = Number(optionalEnv('SMTP_PORT') ?? '587')
  const user = optionalEnv('SMTP_USER')
  const pass = optionalEnv('SMTP_PASSWORD')

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  })

  await transport.sendMail({
    from: optionalEnv('EMAIL_FROM') ?? DEFAULT_FROM,
    to: message.to,
    replyTo: optionalEnv('EMAIL_REPLY_TO'),
    subject: CONFIRMATION_SUBJECT,
    text: confirmationText(message),
    html: confirmationHtml(message),
  })

  return { status: 'sent', provider: 'smtp' }
}

export function emailIsConfigured(): boolean {
  return Boolean(optionalEnv('RESEND_API_KEY') || optionalEnv('SMTP_HOST'))
}

/**
 * Never throws. Every outcome — sent, skipped or failed — is a value the
 * caller records against the submission, so a mail problem is visible in the
 * dashboard and retried hourly rather than lost.
 */
export async function sendConfirmationEmail(message: ConfirmationEmail): Promise<EmailOutcome> {
  if (!message.to || !message.to.includes('@')) {
    return { status: 'skipped', reason: 'No customer email address was given' }
  }

  try {
    const resendKey = optionalEnv('RESEND_API_KEY')
    if (resendKey) return await sendWithResend(resendKey, message)
    return await sendWithSmtp(message)
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown mail error',
    }
  }
}
