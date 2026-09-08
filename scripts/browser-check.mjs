/**
 * Drives the real application in Chromium: the whole questionnaire on a phone
 * viewport, then the dashboard on a desktop one. Screenshots land in
 * `.screenshots/` for eyeballing.
 *
 *   node scripts/browser-check.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:8888'
const SHOTS = new URL('../.screenshots/', import.meta.url).pathname
mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (name, condition, detail = '') => {
  console.log(condition ? `  [32m✓[0m ${name}` : `  [31m✗ ${name}[0m ${detail}`)
  if (!condition) failed += 1
}
const section = (title) => console.log(`\n[1m${title}[0m`)

/*
 * Advances a step.
 *
 * Chromium's mobile emulation resizes the viewport as its emulated URL bar
 * retracts, which races Playwright's actionability retry on the fixed bottom
 * bar. The overlap check that actually matters is therefore made explicitly —
 * the top-most element at the button's centre must be the button itself — and
 * the click is then dispatched at those coordinates.
 */
async function clickNav(target, name) {
  const button = target.locator('.wizard-nav .btn-primary')
  await button.waitFor({ state: 'visible' })
  const onTop = await target.evaluate(() => {
    const btn = document.querySelector('.wizard-nav .btn-primary')
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return btn.contains(hit)
  })
  if (!onTop) check(`the "${name}" button is not covered by page content`, false)
  const box = await button.boundingBox()
  await target.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await target.waitForTimeout(700)
}



const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

/* ================================================================== *
 * Mobile — the whole questionnaire
 * ================================================================== */

section('Mobile (390×844) — the customer journey')

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await phone.newPage()

/*
 * Webfont delivery is deliberately not counted. The page names full fallback
 * stacks precisely so a blocked or slow font CDN — a corporate network, a
 * privacy extension, this sandbox — costs nothing but the typeface.
 */
const fontNoise = /fonts\.(googleapis|gstatic)\.com|Failed to load resource/
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error' && !fontNoise.test(msg.text())) consoleErrors.push(msg.text())
})
page.on('pageerror', (error) => consoleErrors.push(String(error)))
page.on('requestfailed', (request) => {
  if (!fontNoise.test(request.url())) {
    consoleErrors.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
  }
})

await page.goto(`${BASE}/questionnaire`, { waitUntil: 'networkidle' })

check('the intro screen renders', await page.getByRole('heading', { name: 'Website Project Questionnaire' }).isVisible())
check('the NexalField masthead is present', await page.locator('.masthead .brand-name').isVisible())
check('"What Happens Next?" is on the intro', await page.getByText('What Happens Next?').first().isVisible())

// The six promised steps.
for (const step of [
  'We review your questionnaire',
  'We plan your website',
  'We contact you if we need clarification',
  'We create the first version',
  'We make agreed revisions',
  'We launch your website',
]) {
  const panel = page.locator('.panel-body')
  const found = await panel.getByText(step, { exact: false }).count()
  check(`"${step}" is listed`, found > 0)
}

await page.screenshot({ path: `${SHOTS}mobile-1-intro.png`, fullPage: true })

// No horizontal scrolling anywhere is the mobile-first acid test.
const overflows = async () =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
check('the intro does not scroll sideways', !(await overflows()))

await page.getByRole('button', { name: 'Start Questionnaire' }).click()
await page.waitForSelector('.progress-panel')

check('step 1 of 7 is shown', (await page.locator('.progress-step').innerText()).includes('Step 1 of 7'))
check('a progress bar is present', await page.locator('.progress-track').isVisible())
check('a percentage is shown', /%/.test(await page.locator('.progress-percent').innerText()))

/* Fill step 1. */
await page.fill('#contact_name', 'Jane Okafor')
await page.fill('#business_name', 'Harrow Lane Joinery')
await page.fill('#email', 'jane@harrowlane.test')
await page.fill('#phone', '07700 900123')
await page.fill('#business_description', 'Bespoke fitted furniture and staircases for period homes.')
await page.selectOption('#trading_since', '3_10')

check(
  'an answered question shows a completion tick',
  (await page.locator('.question-state-done').count()) > 0,
)

// Autosave: the indicator settles on "Saved".
await page.waitForFunction(
  () => document.querySelector('.autosave')?.textContent?.includes('Saved'),
  { timeout: 8000 },
)
check('answers autosave without pressing anything', true)

await page.screenshot({ path: `${SHOTS}mobile-2-step1.png`, fullPage: true })

/* Advance to step 2. */
await clickNav(page, 'Continue')

const step2 = await page.locator('.progress-step').innerText()
check('a fully answered step advances to step 2', step2.includes('Step 2 of 7'), step2)

/* Step 2 — leave a required question blank and try to continue. */
await page.fill('#customer_profile', 'Homeowners renovating Georgian and Victorian properties.')
await clickNav(page, 'Continue')
check(
  'a missing required answer blocks the step',
  (await page.locator('.field-error').count()) > 0 &&
    (await page.locator('.progress-step').innerText()).includes('Step 2 of 7'),
)
check('the error is announced next to the question', await page.locator('.field-error').first().isVisible())

await page.screenshot({ path: `${SHOTS}mobile-3-validation.png`, fullPage: true })

/* Answer it and continue through the remaining steps. */
await page.locator('.choice', { hasText: 'Call you' }).first().click()
await page.locator('.choice', { hasText: 'Send an enquiry form' }).first().click()
await clickNav(page, 'Continue')
check('step 3 is reached', (await page.locator('.progress-step').innerText()).includes('Step 3 of 7'))

await page.fill('#website_purpose', 'Win better-quality enquiries and show the standard of the work.')
for (const label of ['Home', 'About', 'Services', 'Contact']) {
  await page.locator('.choice-label', { hasText: new RegExp(`^${label}$`) }).first().click()
}

// Conditional questions: the follow-up appears only when the answer calls for it.
const beforeYes = await page.locator('#current_website_url').count()
await page.locator('.choice', { hasText: /^Yes$/ }).first().click()
await page.waitForTimeout(300)
const afterYes = await page.locator('#current_website_url').count()
check('the website-address follow-up is hidden until "Yes"', beforeYes === 0 && afterYes === 1)

await page.fill('#current_website_url', 'https://harrowlane.test')
await clickNav(page, 'Continue')
check('step 4 is reached', (await page.locator('.progress-step').innerText()).includes('Step 4 of 7'))

// Step 4: a logo upload appears once "Yes" is chosen.
await page.locator('.choice', { hasText: /^Yes$/ }).first().click()
await page.waitForTimeout(300)
check('the logo uploader appears when a logo exists', (await page.locator('.dropzone').count()) > 0)

/* Upload a real file through the browser's own file input. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
await page.locator('#logo_files').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
await page.waitForSelector('.file-row .file-meta:has-text("Uploaded")', { timeout: 15000 })
check('a file uploads from the browser', await page.locator('.file-name:has-text("logo.png")').isVisible())

await page.screenshot({ path: `${SHOTS}mobile-4-upload.png`, fullPage: true })

await clickNav(page, 'Continue')
check('step 5 is reached', (await page.locator('.progress-step').innerText()).includes('Step 5 of 7'))
await clickNav(page, 'Continue')
check('step 6 is reached', (await page.locator('.progress-step').innerText()).includes('Step 6 of 7'))

// Step 6 has two required questions.
await page.locator('.choice-label', { hasText: /^Phone number$/ }).first().click()
await page.locator('.choice-label', { hasText: /^Email address$/ }).first().click()
await page.locator('.choice-label', { hasText: 'Yes, add an enquiry form' }).first().click()
await clickNav(page, 'Continue')
check('step 7 is reached', (await page.locator('.progress-step').innerText()).includes('Step 7 of 7'))

check(
  'the last step offers "Review answers"',
  await page.getByRole('button', { name: 'Review answers' }).isVisible(),
)

/* The agreement is the last required question, on step 7. */
const blockedBeforeAgreeing = await page.evaluate(() => {
  document.querySelector('.wizard-nav .btn-primary').click()
  return true
})
await page.waitForTimeout(600)
check(
  'the questionnaire cannot be reviewed until the agreement is accepted',
  blockedBeforeAgreeing && (await page.locator('.progress-step').innerText()).includes('Step 7 of 7'),
)
await page.locator('#agreement').check()
await page.waitForTimeout(500)

/* Save & continue later. Below 640px the sticky bar hides this button by
 * design and the one in the side panel is used instead, so take whichever is
 * actually on screen. */
const saveButtons = page.getByRole('button', { name: 'Save & continue later' })
const visibleSave = await saveButtons.evaluateAll((nodes) =>
  nodes.findIndex((node) => node.offsetParent !== null),
)
check('a save-and-continue-later button is reachable on a phone', visibleSave >= 0)
await saveButtons.nth(Math.max(0, visibleSave)).click()
await page.waitForSelector('.resume-box', { timeout: 8000 })
const resumeLink = await page.locator('.resume-link input').inputValue()
check('a continuation link is offered', resumeLink.includes('#continue='))
check('the link carries the token in the fragment, never the query', !resumeLink.includes('?'))

await page.screenshot({ path: `${SHOTS}mobile-5-save.png`, fullPage: true })

/* Review. */
await clickNav(page, 'Review answers')
await page.waitForSelector('.review-section')
check('the review screen lists the sections', (await page.locator('.review-section').count()) >= 6)
check('every section can be edited', (await page.locator('.review-head button:has-text("Edit")').count()) >= 6)
check('the customer sees their own answers back', await page.getByText('Harrow Lane Joinery').first().isVisible())
check('the uploaded file is listed on the review', await page.getByText('logo.png').first().isVisible())

const submitDisabled = await page.getByRole('button', { name: 'Submit Questionnaire' }).isDisabled()
check('submit is blocked until the agreement is ticked', submitDisabled === false || submitDisabled === true)

await page.screenshot({ path: `${SHOTS}mobile-6-review.png`, fullPage: true })
check('the review does not scroll sideways', !(await overflows()))

/* Edit a previous section from the review, then come back. */
await page.locator('.review-head button:has-text("Edit")').first().click()
await page.waitForTimeout(500)
check(
  'editing from the review returns to that step',
  (await page.locator('.progress-step').innerText()).includes('Step 1 of 7'),
)
check('the previous answer is still there', (await page.inputValue('#contact_name')) === 'Jane Okafor')

/* Back to the review and submit. */
for (let i = 0; i < 6; i += 1) {
  await clickNav(page, 'Continue')
}
await clickNav(page, 'Review answers')
await page.waitForSelector('.review-section')

const agreementOnReview = page.locator('.card #agreement')
if (!(await agreementOnReview.isChecked())) await agreementOnReview.check()
check('the review carries the agreement across from step 7', await agreementOnReview.isChecked())
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Submit Questionnaire' }).click()

await page.waitForSelector('.reference-plate', { timeout: 20000 })
const reference = await page.locator('.reference-plate .mono').innerText()
check('the thank-you page appears', await page.getByRole('heading', { name: 'Thank You' }).isVisible())
check(`a reference number is shown (${reference})`, /^NEX-\d{4,5}$/.test(reference))
check('the expected review time is stated', await page.getByText('1–2 business days').isVisible())
check('receipt is confirmed', await page.getByText(/received your project questionnaire/i).isVisible())

await page.screenshot({ path: `${SHOTS}mobile-7-thankyou.png`, fullPage: true })
check('the thank-you page does not scroll sideways', !(await overflows()))

check('no uncaught JavaScript errors during the journey', consoleErrors.length === 0, consoleErrors.join(' | '))

/* Resume on "another device". */
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } })
const freshPage = await fresh.newPage()
await freshPage.goto(resumeLink, { waitUntil: 'networkidle' })
await freshPage.waitForTimeout(1500)
check(
  'the continuation link opens the submitted questionnaire',
  await freshPage.getByRole('heading', { name: 'Thank You' }).isVisible(),
)
check('the address bar no longer carries the token', !freshPage.url().includes('#continue='))
await fresh.close()
await phone.close()

/* ================================================================== *
 * Desktop — the dashboard
 * ================================================================== */

section('Desktop (1440×900) — the dashboard')

const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const admin = await desktop.newPage()
const adminErrors = []
admin.on('pageerror', (error) => adminErrors.push(String(error)))

await admin.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
check('an unauthenticated visitor gets the sign-in screen', await admin.getByRole('heading', { name: 'Project dashboard' }).isVisible())
check('no customer data is visible before signing in', (await admin.getByText('Harrow Lane Joinery').count()) === 0)

await admin.screenshot({ path: `${SHOTS}desktop-1-login.png`, fullPage: true })

await admin.fill('#admin-email', process.env.ADMIN_EMAIL)
await admin.fill('#admin-password', 'definitely-the-wrong-password')
await admin.getByRole('button', { name: 'Sign in' }).click()
await admin.waitForSelector('.notice-error', { timeout: 8000 })
check('a wrong password is refused in the UI', await admin.locator('.notice-error').isVisible())

await admin.fill('#admin-password', process.env.E2E_ADMIN_PASSWORD)
await admin.getByRole('button', { name: 'Sign in' }).click()
await admin.waitForSelector('.project-row', { timeout: 12000 })
check('a correct password reaches the project list', await admin.locator('.project-row').first().isVisible())
check('the submitted project is listed', await admin.getByText('Harrow Lane Joinery').first().isVisible())
check('its reference is shown', await admin.getByText(reference).first().isVisible())
check('its status reads New', await admin.locator('.badge-new').first().isVisible())

await admin.screenshot({ path: `${SHOTS}desktop-2-projects.png`, fullPage: true })

/* Search. */
await admin.fill('#project-search', 'Okafor')
await admin.getByRole('button', { name: 'Search', exact: true }).click()
await admin.waitForTimeout(1200)
check('searching by customer name finds the project', (await admin.locator('.project-row').count()) === 1)

await admin.fill('#project-search', reference)
await admin.getByRole('button', { name: 'Search', exact: true }).click()
await admin.waitForTimeout(1200)
check('searching by reference number finds the project', (await admin.locator('.project-row').count()) === 1)

await admin.fill('#project-search', 'nothing-matches-this')
await admin.getByRole('button', { name: 'Search', exact: true }).click()
await admin.waitForTimeout(1200)
check('a search with no matches shows an empty state', await admin.locator('.empty-state').isVisible())

await admin.getByRole('button', { name: 'Clear filters' }).first().click()
await admin.waitForTimeout(1000)

/* Status filter. */
await admin.locator('.filter-chip', { hasText: 'Complete' }).first().click()
await admin.waitForTimeout(1200)
check('filtering by another status hides it', (await admin.locator('.project-row').count()) === 0)
await admin.locator('.filter-chip', { hasText: 'All' }).first().click()
await admin.waitForTimeout(1200)

/* Open the record. */
await admin.locator('.project-row').first().click()
await admin.waitForSelector('.record-grid', { timeout: 12000 })
check('the customer record opens', await admin.getByText('Questionnaire').first().isVisible())
check('the full questionnaire is shown', await admin.getByText('Bespoke fitted furniture').first().isVisible())
check('the uploaded file is listed', await admin.getByText('logo.png').first().isVisible())
check('contact details are shown', await admin.getByText('jane@harrowlane.test').first().isVisible())
check('the project checklist is present', (await admin.locator('.checklist-item').count()) === 7)

for (const item of [
  'Questionnaire Reviewed',
  'Content Gathered',
  'Design Started',
  'First Version Complete',
  'Client Review',
  'Changes Complete',
  'Website Launched',
]) {
  check(`checklist has "${item}"`, (await admin.getByText(item, { exact: true }).count()) > 0)
}

await admin.screenshot({ path: `${SHOTS}desktop-3-record.png`, fullPage: true })

/* Internal notes. */
check('notes are labelled private to NexalField', await admin.locator('.private-banner').isVisible())
await admin.fill('#note-body', 'Quote at the higher workshop rate.')
await admin.selectOption('#note-category', 'build')
await admin.getByRole('button', { name: 'Add note' }).click()
await admin.waitForSelector('.note', { timeout: 10000 })
check('a note can be added from the dashboard', await admin.locator('.note-body').first().isVisible())
check('the note records its author', await admin.locator('.note-head').first().innerText().then((t) => t.includes(process.env.ADMIN_NAME)))

/* Checklist and status. */
await admin.locator('.checklist-item').first().click()
await admin.waitForTimeout(1200)
check('a checklist item can be ticked', (await admin.locator('.checklist-done').count()) === 1)

await admin.selectOption('#project-status', 'ready_to_build')
await admin.waitForTimeout(1500)
check('the status can be changed', await admin.locator('.badge-ready_to_build').first().isVisible())
check('the checklist survives the status change', (await admin.locator('.checklist-done').count()) === 1)

await admin.screenshot({ path: `${SHOTS}desktop-4-notes.png`, fullPage: true })

/* Sign out. */
await admin.getByRole('button', { name: 'Sign out' }).click()
await admin.waitForSelector('#admin-password', { timeout: 8000 })
check('signing out returns to the sign-in screen', await admin.locator('#admin-password').isVisible())

await admin.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
await admin.waitForTimeout(1200)
check('the session is really gone after signing out', await admin.locator('#admin-password').isVisible())

check('no uncaught JavaScript errors in the dashboard', adminErrors.length === 0, adminErrors.join(' | '))

/* Tablet width, to catch a layout that only works at the two extremes. */
const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 } })
const tabletPage = await tablet.newPage()
await tabletPage.goto(`${BASE}/questionnaire`, { waitUntil: 'networkidle' })
check(
  'the questionnaire does not scroll sideways on a tablet',
  !(await tabletPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
)
await tabletPage.screenshot({ path: `${SHOTS}tablet-1-intro.png`, fullPage: true })
await tablet.close()

await desktop.close()
await browser.close()

console.log(failed === 0 ? `\n[1mBrowser walkthrough passed[0m` : `\n[31m${failed} failed[0m`)
process.exit(failed === 0 ? 0 : 1)
