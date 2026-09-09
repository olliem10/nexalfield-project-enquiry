/**
 * The customer confirmation email.
 *
 * Two providers are supported and neither is required: if no mail credentials
 * are configured the send is recorded as "skipped" and the submission still
 * succeeds. Losing an email is a nuisance; losing a customer's questionnaire
 * because a mail server was down would not be.
 */
import nodemailer from 'nodemailer'
import { optionalEnv } from './http'

export type EmailOutcome =
  | { status: 'sent'; provider: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export interface ConfirmationEmail {
  to: string
  customerName: string
  reference: string
}

export interface AdminNotification {
  to: string
  customerName: string
  customerEmail: string
  reference: string
}

interface OutgoingMessage {
  to: string
  subject: string
  text: string
  html: string
}

const DEFAULT_FROM = 'NexalField <onboarding@nexalfield.com>'

export const CONFIRMATION_SUBJECT = 'NexalField Project Enquiry Received'

export function confirmationText({ customerName, reference }: ConfirmationEmail): string {
  const name = customerName.trim() || 'there'
  return `Hi ${name},

Thank you for completing the NexalField Website Project Enquiry.

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
                <p style="margin:0 0 18px;">Thank you for completing the NexalField Website Project Enquiry.</p>
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

async function sendWithResend(apiKey: string, message: OutgoingMessage): Promise<EmailOutcome> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: optionalEnv('EMAIL_FROM') ?? DEFAULT_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
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

async function sendWithSmtp(message: OutgoingMessage): Promise<EmailOutcome> {
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
    subject: message.subject,
    text: message.text,
    html: message.html,
  })

  return { status: 'sent', provider: 'smtp' }
}

/** Never throws: every outcome is a value the caller decides what to do with. */
async function deliver(message: OutgoingMessage): Promise<EmailOutcome> {
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

export function emailIsConfigured(): boolean {
  return Boolean(optionalEnv('RESEND_API_KEY') || optionalEnv('SMTP_HOST'))
}

/**
 * Never throws. Every outcome — sent, skipped or failed — is a value the
 * caller records against the submission, so a mail problem is visible in the
 * dashboard and retried by the housekeeping job rather than lost.
 */
export async function sendConfirmationEmail(message: ConfirmationEmail): Promise<EmailOutcome> {
  if (!message.to || !message.to.includes('@')) {
    return { status: 'skipped', reason: 'No customer email address was given' }
  }

  return deliver({
    to: message.to,
    subject: CONFIRMATION_SUBJECT,
    text: confirmationText(message),
    html: confirmationHtml(message),
  })
}

function adminNotificationText({ customerName, customerEmail, reference }: AdminNotification): string {
  const name = customerName.trim() || 'Not given'
  const email = customerEmail.trim() || 'Not given'
  return `A new website project enquiry has just been submitted.

Reference Number: ${reference}
Customer name: ${name}
Customer email: ${email}

Sign in to the dashboard to see the full enquiry and uploaded files.`
}

function adminNotificationHtml({ customerName, customerEmail, reference }: AdminNotification): string {
  const name = escapeHtml(customerName.trim() || 'Not given')
  const email = escapeHtml(customerEmail.trim() || 'Not given')
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
                <p style="margin:0 0 18px;">A new website project enquiry has just been submitted.</p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f2ec;border:1px solid #e6e1d8;border-radius:10px;margin:0 0 24px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 10px;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:#6b716d;">Reference Number</p>
                      <p style="margin:0 0 16px;font:600 20px/1.3 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.04em;color:#245945;">${ref}</p>
                      <p style="margin:0 0 4px;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:#6b716d;">Customer</p>
                      <p style="margin:0 0 12px;">${name}</p>
                      <p style="margin:0 0 4px;font:400 13px/1.4 Helvetica,Arial,sans-serif;color:#6b716d;">Email</p>
                      <p style="margin:0;">${email}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:0;">Sign in to the dashboard to see the full enquiry and uploaded files.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Tells NexalField a new enquiry has come in. Same never-throws contract as
 * the customer confirmation: this is a courtesy notification, not something a
 * submission can fail on.
 */
export async function sendAdminNotification(message: AdminNotification): Promise<EmailOutcome> {
  if (!message.to || !message.to.includes('@')) {
    return { status: 'skipped', reason: 'No admin recipient is configured' }
  }

  return deliver({
    to: message.to,
    subject: `New Project Enquiry Received — ${message.reference}`,
    text: adminNotificationText(message),
    html: adminNotificationHtml(message),
  })
}
