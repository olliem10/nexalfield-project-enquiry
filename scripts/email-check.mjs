/**
 * Proves the confirmation email really sends, by running a throwaway SMTP
 * server and posting a submission through the real email task.
 *
 *   node --experimental-strip-types scripts/email-check.mjs
 */
import { createServer } from 'node:net'

/* ---------------------------------------------------------------- *
 * A minimal SMTP sink — enough of the protocol for nodemailer.
 * ---------------------------------------------------------------- */

const received = []

const smtp = createServer((socket) => {
  let buffer = ''
  let inData = false
  let message = ''

  socket.write('220 localhost ESMTP test\r\n')

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')

    for (;;) {
      if (inData) {
        const terminator = buffer.indexOf('\r\n.\r\n')
        if (terminator < 0) return
        message += buffer.slice(0, terminator)
        buffer = buffer.slice(terminator + 5)
        inData = false
        received.push(message)
        message = ''
        socket.write('250 OK queued\r\n')
        continue
      }

      const newline = buffer.indexOf('\r\n')
      if (newline < 0) return
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 2)
      const command = line.split(' ')[0].toUpperCase()

      if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250 8BITMIME\r\n')
      else if (command === 'MAIL' || command === 'RCPT') socket.write('250 OK\r\n')
      else if (command === 'DATA') {
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
        inData = true
      } else if (command === 'QUIT') {
        socket.write('221 Bye\r\n')
        socket.end()
        return
      } else socket.write('250 OK\r\n')
    }
  })
})

await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve))
const smtpPort = smtp.address().port

process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(smtpPort)
process.env.EMAIL_FROM = 'NexalField <onboarding@nexalfield.com>'
process.env.EMAIL_REPLY_TO = 'nexalfield@gmail.com'
delete process.env.RESEND_API_KEY

/* ---------------------------------------------------------------- *
 * Send through the real task
 * ---------------------------------------------------------------- */

process.env.ADMIN_EMAIL = 'ollie@nexalfield.com'
process.env.ADMIN_NAME = 'Ollie'

const { CONFIRMATION_SUBJECT } = await import('../server/lib/email.ts')
const { runEmailTask, runAdminNotificationTask } = await import('../server/lib/tasks.ts')
const { getDb } = await import('../server/lib/db.ts')
const { submissions } = await import('../db/schema.ts')
const { eq, isNotNull } = await import('drizzle-orm')

const db = getDb()
const [record] = await db
  .select()
  .from(submissions)
  .where(isNotNull(submissions.submittedAt))
  .limit(1)

if (!record) {
  console.error('No submitted record found — run scripts/e2e.mjs first.')
  process.exit(1)
}

await runEmailTask(record.id)
await runAdminNotificationTask(record.id)

const [after] = await db
  .select()
  .from(submissions)
  .where(eq(submissions.id, record.id))
  .limit(1)

smtp.close()

/* ---------------------------------------------------------------- *
 * Assertions
 * ---------------------------------------------------------------- */

let failed = 0
const check = (name, condition, detail = '') => {
  console.log(condition ? `  [32m✓[0m ${name}` : `  [31m✗ ${name}[0m ${detail}`)
  if (!condition) failed += 1
}

const decode = (raw) =>
  raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

const confirmation = received.find((raw) => decode(raw).includes(record.email))
const notification = received.find((raw) => decode(raw).includes('ollie@nexalfield.com'))
const decoded = decode(confirmation ?? '')

console.log('\n[1mConfirmation email[0m')
check('exactly two messages were delivered', received.length === 2, `got ${received.length}`)
check('the record is marked sent', after.emailStatus === 'sent', after.emailStatus ?? after.emailError ?? '')
check('the provider is recorded', after.emailProvider === 'smtp')
check('the sent time is recorded', after.emailSentAt instanceof Date)
check(`the subject is "${CONFIRMATION_SUBJECT}"`, decoded.includes(`Subject: ${CONFIRMATION_SUBJECT}`))
check('it is addressed to the customer', decoded.includes(record.email))
check('it greets them by name', decoded.includes(`Hi ${record.contactName},`))
check('it carries the reference number', decoded.includes(record.reference))
check('it thanks them for the enquiry', decoded.includes('Thank you for completing the NexalField Website Project Enquiry'))
check('it confirms receipt', decoded.includes('We have successfully received your information'))
check('it says we will be in touch', decoded.includes('We will contact you if we need any additional information'))
check('it signs off from Ollie at NexalField', decoded.includes('Ollie') && decoded.includes('NexalField'))
check('it sends from the configured address', decoded.includes('onboarding@nexalfield.com'))
check('replies go to the configured address', decoded.includes('nexalfield@gmail.com'))
check('both a plain-text and an HTML part are present', decoded.includes('text/plain') && decoded.includes('text/html'))

console.log('\n[1mAdmin notification email[0m')
const notifDecoded = decode(notification ?? '')
check('a notification was sent to the admin', Boolean(notification))
check('it is addressed to the configured admin', notifDecoded.includes('ollie@nexalfield.com'))
check('it carries the reference number', notifDecoded.includes(record.reference))
check('it names the customer', notifDecoded.includes(record.contactName ?? ''))
check('it carries the customer email', notifDecoded.includes(record.email ?? ''))
check('it points to the dashboard', notifDecoded.includes('Sign in to the dashboard'))

console.log(failed === 0 ? '\n[1mEmail delivery verified[0m' : `\n[31m${failed} failed[0m`)
process.exit(failed === 0 ? 0 : 1)
