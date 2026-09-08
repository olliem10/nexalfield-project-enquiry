/**
 * UI/UX audit harness.
 *
 * Walks every screen at every breakpoint, captures a screenshot of each, and
 * collects the measurements that catch the problems a screenshot alone does
 * not: horizontal overflow, elements wider than their container, tap targets
 * under 44px, text under 12px, and contrast below WCAG AA.
 *
 *   node scripts/ui-audit.mjs [label]
 *
 * Screenshots go to .audit/<label>/, findings to .audit/<label>/findings.json.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const LABEL = process.argv[2] ?? 'before'
const BASE = process.env.BASE_URL ?? 'http://localhost:8888'
const OUT = new URL(`../.audit/${LABEL}/`, import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '360', width: 360, height: 780, mobile: true },
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '768', width: 768, height: 1024, mobile: false },
  { name: '1024', width: 1024, height: 768, mobile: false },
  { name: '1440', width: 1440, height: 900, mobile: false },
]

const findings = []
const record = (severity, viewport, screen, issue, detail) => {
  findings.push({ severity, viewport, screen, issue, detail })
}

/* ------------------------------------------------------------------ *
 * Measurements run inside the page
 * ------------------------------------------------------------------ */

const MEASURE = (isTouch) => {
  const out = {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    coarse: window.matchMedia('(pointer: coarse)').matches,
    overflowing: [],
    smallTapTargets: [],
    smallText: [],
    lowContrast: [],
    truncated: [],
  }

  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(',').map((n) => parseFloat(n))
    if (parts.length > 3 && parts[3] === 0) return null
    return parts.slice(0, 3)
  }
  const effectiveBackground = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor)
      if (bg) return bg
      node = node.parentElement
    }
    return [255, 255, 255]
  }

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 110)
  }

  // Content deliberately hidden from sight for screen readers is clipped to a
  // 1px box by design; measuring it as overflow or truncation is noise.
  const screenReaderOnly = (el) => el.closest('.visually-hidden, .skip-link') !== null

  // A row that scrolls sideways on purpose (the status filters) has children
  // past the viewport edge by design.
  const inHorizontalScroller = (el) => {
    let node = el.parentElement
    while (node && node !== document.body) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
      node = node.parentElement
    }
    return false
  }

  for (const el of document.querySelectorAll('body *')) {
    if (screenReaderOnly(el)) continue
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue

    // Anything sticking out past the right edge of the viewport.
    if (rect.right > window.innerWidth + 1 && style.position !== 'fixed' && !inHorizontalScroller(el)) {
      out.overflowing.push({ el: describe(el), right: Math.round(rect.right), width: Math.round(rect.width) })
    }

    /*
     * 44px is a *touch* guideline. Applying it to a mouse-driven dashboard
     * would flag every compact control as broken, so it is only checked where
     * the pointer is actually coarse.
     */
    const interactive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)
    if (isTouch && interactive && el.type !== 'hidden' && rect.height > 0) {
      const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 40)
      // A checkbox or radio inside a label is not the target; the label is.
      const wrappedByLabel = (el.type === 'checkbox' || el.type === 'radio') && el.closest('label')
      if (rect.height < 44 && el.tagName !== 'A' && !wrappedByLabel) {
        out.smallTapTargets.push({ el: describe(el), height: Math.round(rect.height), label })
      }
    }

    // Text below 12px is hard to read on a phone.
    const size = parseFloat(style.fontSize)
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
    if (ownText.length > 2 && size < 12) {
      out.smallText.push({ el: describe(el), size, text: ownText.slice(0, 40) })
    }

    // Contrast, for elements that own their text.
    if (ownText.length > 2) {
      const fg = parse(style.color)
      const bg = effectiveBackground(el)
      if (fg && bg) {
        const l1 = luminance(fg)
        const l2 = luminance(bg)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const bold = parseInt(style.fontWeight, 10) >= 700
        const large = size >= 24 || (size >= 18.66 && bold)
        const required = large ? 3 : 4.5
        if (ratio < required) {
          out.lowContrast.push({
            el: describe(el),
            ratio: Math.round(ratio * 100) / 100,
            required,
            size,
            text: ownText.slice(0, 40),
          })
        }
      }
    }

    // Text clipped by its own box.
    if (el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'visible' && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
      if (ownText.length > 2) out.truncated.push({ el: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */


/*
 * Clicks by coordinate after centring the target.
 *
 * The page has a sticky progress panel at the top and a fixed nav at the
 * bottom, and (finding 1) no scroll-padding to keep content clear of them, so
 * Playwright's own scroll-into-view can leave a target underneath one of them.
 * Centring first, then dispatching at the resulting coordinates, sidesteps
 * that so the sweep can reach every screen.
 */
async function tap(page, locator) {
  await locator.waitFor({ state: 'visible' })
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(150)
  const box = await locator.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(250)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

async function capture(page, viewport, screen) {
  await page.waitForTimeout(350)
  /*
   * Measure before the screenshot. A fullPage capture resizes the viewport to
   * the document height, and Chromium drops mobile emulation while it does —
   * so `pointer: coarse` stops matching and touch-only rules read as absent.
   */
  const m = await page.evaluate(MEASURE, viewport.mobile)
  await page.screenshot({ path: `${OUT}${viewport.name}-${screen}.png`, fullPage: true })

  if (m.scrollWidth > m.innerWidth + 1) {
    record('high', viewport.name, screen, 'horizontal overflow', `page scrollWidth ${m.scrollWidth} > viewport ${m.innerWidth}`)
  }
  for (const o of m.overflowing.slice(0, 6)) {
    record('high', viewport.name, screen, 'element past right edge', `${o.el} right=${o.right}`)
  }
  /*
   * Tap targets are deliberately NOT reported here. Chromium drops touch
   * emulation the first time a fullPage screenshot is taken, and never
   * restores it, so `pointer: coarse` stops matching and every touch-only rule
   * reads as absent. They are measured in `touchPass()` instead, in a context
   * that takes no screenshots.
   */
  for (const t of m.smallText.slice(0, 6)) {
    record('medium', viewport.name, screen, 'text under 12px', `${t.el} ${t.size}px "${t.text}"`)
  }
  for (const c of m.lowContrast.slice(0, 10)) {
    record('high', viewport.name, screen, 'contrast below AA', `${c.el} ${c.ratio}:1 (needs ${c.required}) "${c.text}"`)
  }
  for (const t of m.truncated.slice(0, 5)) {
    record('medium', viewport.name, screen, 'clipped text', `${t.el} ${t.scrollWidth}>${t.clientWidth}`)
  }
}

/* Seed one submitted project so the dashboard has something to show. */
async function seed() {
  const api = async (path, options = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(options.token ? { 'x-nexalfield-resume': options.token } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const started = await api('/api/questionnaire/session', { method: 'POST', body: {} })
  const token = started.body.token
  const answers = {
    contact_name: 'Jane Okafor',
    business_name: 'Harrow Lane Joinery & Restoration',
    email: 'jane.okafor@harrowlanejoinery.test',
    phone: '07700 900123',
    business_address: { line1: '14 Harrow Lane', city: 'Bath', county: 'Somerset', postcode: 'BA1 2XY', country: 'United Kingdom' },
    business_description: 'Bespoke fitted furniture, staircases and sash window restoration for period homes across the West Country.',
    trading_since: '3_10',
    differentiator: 'Everything is made in our own workshop, by the person who measured it.',
    customer_profile: 'Homeowners renovating Georgian and Victorian properties, plus two or three architects who specify us.',
    customer_locations: 'Bath, Bristol and north Somerset, occasionally as far as Exeter.',
    visitor_actions: { selected: ['call', 'enquiry_form', 'browse'], custom: ['Request a brochure'] },
    website_purpose: 'Win better-quality enquiries and show the standard of the work.',
    pages_wanted: { selected: ['home', 'about', 'services', 'gallery', 'testimonials', 'contact'], custom: ['Restoration case studies'] },
    has_website: 'yes',
    current_website_url: 'https://harrowlanejoinery.test',
    current_website_feedback: 'It is ten years old and unreadable on a phone.',
    has_logo: 'yes',
    has_brand_colours: 'yes',
    brand_colours: [{ value: '#2F4F3A', note: 'Signage and logo' }, { value: 'warm cream', note: 'Backgrounds' }],
    design_style: { selected: ['premium', 'natural', 'clean'], custom: [] },
    reference_websites: 'benchmarkfurniture.test — the photography is excellent.',
    has_photos: 'some',
    has_content: 'no',
    key_information: 'Guild of Master Craftsmen members since 2015. Ten-year guarantee on all fitted work.',
    has_testimonials: 'yes',
    testimonials: '"Faultless from start to finish." — R. Patel, Bath',
    contact_details: { selected: ['phone', 'email', 'address', 'opening_hours'], custom: [] },
    opening_hours: { monday: { open: '08:00', close: '17:00' }, tuesday: { open: '08:00', close: '17:00' }, saturday: { open: '09:00', close: '13:00' }, sunday: { closed: true } },
    social_links: [{ platform: 'Instagram', url: 'https://instagram.com/harrowlane' }],
    contact_form: 'yes',
    desired_features: { selected: ['gallery', 'map', 'reviews'], custom: [] },
    exclusions: 'No pop-ups and no stock photography.',
    competitors: 'Two local joiners, both with very dated sites.',
    anything_else: 'We would like to launch before the spring show.',
    agreement: true,
  }
  await api('/api/questionnaire/session', { method: 'PATCH', token, body: { answers, currentStep: 7 } })
  const submitted = await api('/api/questionnaire/submit', { method: 'POST', token, body: { answers } })
  return submitted.body?.reference
}

const reference = await seed()
console.log('Seeded', reference)

/*
 * Touch-target pass.
 *
 * Runs in its own context and never screenshots, because a fullPage capture
 * permanently disables Chromium's touch emulation for that page.
 */
async function touchPass(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 800 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  const small = []

  const scan = async (screen) => {
    const found = await page.evaluate(() => {
      if (!window.matchMedia('(pointer: coarse)').matches) return 'NOT_COARSE'
      const out = []
      for (const el of document.querySelectorAll('button, select, input:not([type=hidden]), textarea')) {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (el.closest('.visually-hidden')) continue
        if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) continue
        const rect = el.getBoundingClientRect()
        if (rect.height === 0) continue
        if (rect.height < 44) {
          const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 34)
          out.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} h=${Math.round(rect.height)} "${label}"`)
        }
      }
      return out
    })
    if (found === 'NOT_COARSE') {
      console.log(`    [harness] touch emulation lost before ${screen}`)
      return
    }
    for (const entry of found) small.push({ screen, entry })
  }

  await page.goto(`${BASE}/questionnaire`, { waitUntil: 'networkidle' })
  await scan('intro')
  await page.getByRole('button', { name: 'Start Questionnaire' }).click()
  await page.waitForSelector('.progress-panel')
  await scan('wizard')

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await scan('login')
  await page.fill('#admin-email', process.env.ADMIN_EMAIL)
  await page.fill('#admin-password', process.env.E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.project-row', { timeout: 15000 })
  await scan('projects')
  await page.locator('.project-row').first().click()
  await page.waitForSelector('.record-grid', { timeout: 15000 })
  await scan('record')

  await ctx.close()
  for (const s of small) record('medium', String(width), s.screen, 'tap target under 44px', s.entry)
  console.log(`  touch pass @${width}px: ${small.length} controls under 44px`)
}

/*
 * The sweep signs in once per viewport, which trips the login rate limiter —
 * it allows ten attempts per address per quarter hour, and that is the correct
 * behaviour. Clearing the counter between viewports keeps the audit moving
 * without weakening the limit itself.
 */
const limiter = new pg.Pool({ connectionString: process.env.NETLIFY_DATABASE_URL, max: 1 })
const clearRateLimits = () => limiter.query('delete from rate_limits')

await clearRateLimits()
for (const width of [360, 390]) await touchPass(width)

for (const viewport of VIEWPORTS) {
  console.log(`\n--- ${viewport.name}px ---`)
  await clearRateLimits()
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  })
  const page = await ctx.newPage()

  /* Intro */
  await page.goto(`${BASE}/questionnaire`, { waitUntil: 'networkidle' })
  await capture(page, viewport, '01-intro')

  /* Step 1, empty */
  await tap(page, page.getByRole('button', { name: 'Start Questionnaire' }))
  await page.waitForSelector('.progress-panel')
  await capture(page, viewport, '02-step1-empty')

  /* Step 1, filled */
  await page.fill('#contact_name', 'Jane Okafor')
  await page.fill('#business_name', 'Harrow Lane Joinery & Restoration')
  await page.fill('#email', 'jane.okafor@harrowlanejoinery.test')
  await page.fill('#phone', '07700 900123')
  await page.fill('#business_description', 'Bespoke fitted furniture, staircases and sash window restoration for period homes across the West Country.')
  await page.selectOption('#trading_since', '3_10')
  await page.waitForTimeout(1400)
  await capture(page, viewport, '03-step1-filled')

  // Below 1000px the nav is fixed to the bottom; above it, it is static and
  // scrolls with the page — so it has to be brought into view either way.
  const nav = async () => {
    await tap(page, page.locator('.wizard-nav .btn-primary'))
    await page.waitForTimeout(700)
  }

  /* Step 2 with a validation error */
  await nav()
  await page.fill('#customer_profile', 'Homeowners renovating Georgian and Victorian properties.')
  await nav()
  await capture(page, viewport, '04-validation-error')

  await tap(page, page.locator('.choice', { hasText: 'Call you' }).first())
  await nav()

  /* Step 3 — multi-select and a conditional follow-up */
  await page.fill('#website_purpose', 'Win better-quality enquiries and show the standard of the work.')
  for (const label of ['Home', 'About', 'Services', 'Contact']) {
    await tap(page, page.locator('.choice-label', { hasText: new RegExp(`^${label}$`) }).first())
  }
  await tap(page, page.locator('.choice', { hasText: /^Yes$/ }).first())
  await page.waitForTimeout(400)
  await page.fill('#current_website_url', 'https://harrowlanejoinery.test')
  await capture(page, viewport, '05-step3-multiselect')
  await nav()

  /* Step 4 — uploads and the colour repeater */
  await tap(page, page.locator('.choice', { hasText: /^Yes$/ }).first())
  await page.waitForTimeout(400)
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.locator('#logo_files').setInputFiles({ name: 'harrow-lane-logo-full-colour.png', mimeType: 'image/png', buffer: PNG })
  await page.waitForSelector('.file-row .file-meta:has-text("Uploaded")', { timeout: 20000 })
  const colourYes = page.locator('.choice', { hasText: /^Yes$/ }).nth(1)
  if (await colourYes.count()) {
    await tap(page, colourYes)
    await page.waitForTimeout(400)
  }
  await capture(page, viewport, '06-step4-upload')

  /* An upload error state */
  await page.locator('#logo_files').setInputFiles({ name: 'not-allowed.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') })
  await page.waitForTimeout(900)
  await capture(page, viewport, '07-upload-error')
  await nav()

  /* Step 5, 6 — hours and social repeaters */
  await nav()
  await tap(page, page.locator('.choice-label', { hasText: /^Phone number$/ }).first())
  await tap(page, page.locator('.choice-label', { hasText: 'Yes, add an enquiry form' }).first())
  await page.waitForTimeout(400)
  await capture(page, viewport, '08-step6-hours')
  await nav()

  /* Step 7 and the agreement */
  await tap(page, page.locator('#agreement'))
  await page.waitForTimeout(400)
  await capture(page, viewport, '09-step7-agreement')

  /* Save & continue later */
  const saveButtons = page.getByRole('button', { name: 'Save & continue later' })
  const visibleSave = await saveButtons.evaluateAll((nodes) => nodes.findIndex((n) => n.offsetParent !== null))
  if (visibleSave >= 0) {
    await tap(page, saveButtons.nth(visibleSave))
    await page.waitForSelector('.resume-box', { timeout: 8000 })
    await capture(page, viewport, '10-save-later')
  }

  /* Review */
  await nav()
  await page.waitForSelector('.review-section')
  await capture(page, viewport, '11-review')

  /* Thank you */
  await tap(page, page.getByRole('button', { name: 'Submit Questionnaire' }))
  await page.waitForSelector('.reference-plate', { timeout: 25000 })
  await page.waitForTimeout(2500)
  await capture(page, viewport, '12-thankyou')

  /* Dashboard: login */
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await capture(page, viewport, '13-login')

  await page.fill('#admin-email', process.env.ADMIN_EMAIL)
  await page.fill('#admin-password', 'wrong-password-here')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.notice-error', { timeout: 10000 })
  await capture(page, viewport, '14-login-error')

  await page.fill('#admin-password', process.env.E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector('.project-row', { timeout: 15000 })
  await capture(page, viewport, '15-projects')

  await tap(page, page.locator('.project-row').first())
  await page.waitForSelector('.record-grid', { timeout: 15000 })
  await capture(page, viewport, '16-record')

  await ctx.close()
}

await browser.close()
await limiter.end()

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

writeFileSync(`${OUT}findings.json`, JSON.stringify(findings, null, 2))

const grouped = new Map()
for (const f of findings) {
  const key = `${f.severity}|${f.issue}|${f.detail}`
  if (!grouped.has(key)) grouped.set(key, { ...f, viewports: new Set() })
  grouped.get(key).viewports.add(f.viewport)
}

const order = { high: 0, medium: 1, low: 2 }
const rows = [...grouped.values()].sort((a, b) => order[a.severity] - order[b.severity])

console.log(`\n${findings.length} raw findings, ${rows.length} distinct\n`)
for (const r of rows.slice(0, 120)) {
  console.log(`[${r.severity}] ${r.issue} @${[...r.viewports].join(',')} (${r.screen})`)
  console.log(`    ${r.detail}`)
}
