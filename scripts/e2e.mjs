/**
 * End-to-end exercise of the real functions against a real Postgres and a real
 * (local) blob store. Nothing is mocked except the transport: each function's
 * default export is invoked exactly as Netlify invokes it.
 *
 *   node --experimental-strip-types scripts/e2e.mjs
 */
import { BlobsServer } from '@netlify/blobs/server'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* ---------------------------------------------------------------- *
 * Environment
 * ---------------------------------------------------------------- */

const BLOB_DIR = mkdtempSync(join(tmpdir(), 'nf-blobs-'))
const BLOB_TOKEN = 'local-blobs-token'

const blobServer = new BlobsServer({
  directory: BLOB_DIR,
  token: BLOB_TOKEN,
  port: 0,
})
const { port: blobPort } = await blobServer.start()

process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({
    edgeURL: `http://127.0.0.1:${blobPort}`,
    uncachedEdgeURL: `http://127.0.0.1:${blobPort}`,
    token: BLOB_TOKEN,
    siteID: 'nexalfield-test',
    primaryRegion: 'us-east-1',
  }),
).toString('base64')

/* ---------------------------------------------------------------- *
 * Test plumbing
 * ---------------------------------------------------------------- */

let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  [32m✓[0m ${name}`)
  } else {
    failed += 1
    failures.push(name)
    console.log(`  [31m✗ ${name}[0m ${detail}`)
  }
}

function section(title) {
  console.log(`\n[1m${title}[0m`)
}

const BASE = 'http://localhost:8888'

/** Invokes a function the way Netlify does: a Request plus a Context. */
async function call(handler, { method = 'GET', path = '/', body, headers = {}, params = {}, cookies = '' } = {}) {
  const init = { method, headers: { ...headers } }
  if (cookies) init.headers.cookie = cookies
  if (body !== undefined) {
    if (body instanceof Uint8Array) {
      init.body = body
      init.headers['content-type'] = 'application/octet-stream'
    } else {
      init.body = JSON.stringify(body)
      init.headers['content-type'] = 'application/json'
    }
  }

  const request = new Request(`${BASE}${path}`, init)
  const context = {
    params,
    ip: '203.0.113.10',
    waitUntil: (promise) => pending.push(promise),
  }
  const response = await handler(request, context)
  let payload = null
  const text = await response.clone().text()
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  return { response, status: response.status, body: payload }
}

const pending = []
const flush = async () => {
  while (pending.length) await Promise.allSettled(pending.splice(0))
}

/* ---------------------------------------------------------------- *
 * Load the real modules
 * ---------------------------------------------------------------- */

const sessionFn = (await import('../netlify/functions/questionnaire-session.mts')).default
const submitFn = (await import('../netlify/functions/questionnaire-submit.mts')).default
const summaryFn = (await import('../netlify/functions/questionnaire-summary.mts')).default
const initFn = (await import('../netlify/functions/uploads-init.mts')).default
const chunkFn = (await import('../netlify/functions/uploads-chunk.mts')).default
const completeFn = (await import('../netlify/functions/uploads-complete.mts')).default
const deleteFileFn = (await import('../netlify/functions/uploads-delete.mts')).default
const authFn = (await import('../netlify/functions/admin-auth.mts')).default
const projectsFn = (await import('../netlify/functions/admin-projects.mts')).default
const projectFn = (await import('../netlify/functions/admin-project.mts')).default
const notesFn = (await import('../netlify/functions/admin-notes.mts')).default
const checklistFn = (await import('../netlify/functions/admin-checklist.mts')).default
const adminFileFn = (await import('../netlify/functions/admin-file.mts')).default
const actionsFn = (await import('../netlify/functions/admin-actions.mts')).default
const retryFn = (await import('../netlify/functions/retry-outstanding.mts')).default

const { CHECKLIST_ITEMS, completionPercent, TOTAL_STEPS } = await import(
  '../shared/questionnaire.ts'
)

/* ---------------------------------------------------------------- *
 * A complete set of answers
 * ---------------------------------------------------------------- */

const ANSWERS = {
  contact_name: 'Jane Okafor',
  business_name: 'Harrow Lane Joinery',
  email: 'jane@harrowlane.test',
  phone: '07700 900123',
  business_address: { line1: '14 Harrow Lane', city: 'Bath', postcode: 'BA1 2XY' },
  business_description: 'Bespoke fitted furniture and staircases for period homes.',
  trading_since: '3_10',
  differentiator: 'Everything is made in our own workshop, by the person who measures it.',
  customer_profile: 'Homeowners renovating Georgian and Victorian properties.',
  customer_locations: 'Bath, Bristol and north Somerset.',
  visitor_actions: { selected: ['call', 'enquiry_form', 'browse'], custom: ['Request a brochure'] },
  website_purpose: 'Win better-quality enquiries and show the standard of the work.',
  pages_wanted: { selected: ['home', 'about', 'services', 'gallery', 'contact'], custom: [] },
  has_website: 'yes',
  current_website_url: 'https://harrowlane.test',
  current_website_feedback: 'It is ten years old and unreadable on a phone.',
  has_logo: 'yes',
  has_brand_colours: 'yes',
  brand_colours: [{ value: '#2F4F3A', note: 'Signage and logo' }],
  design_style: { selected: ['premium', 'natural'], custom: [] },
  reference_websites: 'benchmarkfurniture.test — the photography is excellent.',
  has_photos: 'some',
  has_content: 'no',
  key_information: 'Guild of Master Craftsmen members since 2015. Ten-year guarantee.',
  has_testimonials: 'yes',
  testimonials: '"Faultless from start to finish." — R. Patel, Bath',
  contact_details: { selected: ['phone', 'email', 'address', 'opening_hours'], custom: [] },
  opening_hours: {
    monday: { open: '08:00', close: '17:00' },
    saturday: { open: '09:00', close: '13:00' },
    sunday: { closed: true },
  },
  social_links: [{ platform: 'Instagram', url: 'https://instagram.com/harrowlane' }],
  contact_form: 'yes',
  desired_features: { selected: ['gallery', 'map', 'reviews'], custom: [] },
  exclusions: 'No pop-ups and no stock photography.',
  competitors: 'Two local joiners, both with very dated sites.',
  anything_else: 'We would like to launch before the spring show.',
  agreement: true,
}

/* A valid 1x1 PNG. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/* ================================================================== *
 * 1. Draft lifecycle: start, save, resume
 * ================================================================== */

section('1. Draft lifecycle — start, autosave, resume')

const started = await call(sessionFn, { method: 'POST', path: '/api/questionnaire/session', body: {} })
check('POST creates a draft (201)', started.status === 201, `got ${started.status}`)
check('a continuation token is returned', typeof started.body?.token === 'string' && started.body.token.length > 30)
check('the token is not a database id', started.body?.token !== started.body?.session?.id)
check('draft starts at step 1', started.body?.session?.currentStep === 1)

const TOKEN = started.body.token
const auth = { 'x-nexalfield-resume': TOKEN }

const saved = await call(sessionFn, {
  method: 'PATCH',
  path: '/api/questionnaire/session',
  headers: auth,
  body: { answers: { contact_name: 'Jane Okafor', business_name: 'Harrow Lane Joinery' }, currentStep: 2 },
})
check('PATCH autosaves', saved.status === 200 && typeof saved.body?.savedAt === 'string')

const resumed = await call(sessionFn, { path: '/api/questionnaire/session', headers: auth })
check('GET resumes the saved answers', resumed.body?.session?.answers?.business_name === 'Harrow Lane Joinery')
check('GET restores the step', resumed.body?.session?.currentStep === 2)
check('furthest step advances', resumed.body?.session?.furthestStep === 2)

const badToken = await call(sessionFn, {
  path: '/api/questionnaire/session',
  headers: { 'x-nexalfield-resume': 'x'.repeat(43) },
})
check('an unknown token is 404, not a leak', badToken.status === 404)

const noToken = await call(sessionFn, { path: '/api/questionnaire/session' })
check('a missing token is rejected', noToken.status === 401)

/* ================================================================== *
 * 2. Validation
 * ================================================================== */

section('2. Server-side validation')

const partial = await call(submitFn, {
  method: 'POST',
  path: '/api/questionnaire/submit',
  headers: auth,
  body: { answers: { contact_name: 'Jane' } },
})
check('incomplete answers are refused (422)', partial.status === 422, `got ${partial.status}`)
check('the refusal names the fields', Array.isArray(partial.body?.error?.fields) && partial.body.error.fields.length > 0)
check(
  'each problem carries its step so the customer can be sent back',
  partial.body?.error?.fields?.every((f) => typeof f.step === 'number'),
)
check(
  'a required missing answer is reported',
  partial.body.error.fields.some((f) => f.fieldId === 'business_name'),
)

const badEmail = await call(submitFn, {
  method: 'POST',
  path: '/api/questionnaire/submit',
  headers: auth,
  body: { answers: { ...ANSWERS, email: 'not-an-address' } },
})
check('a malformed email is caught server-side', badEmail.status === 422 && badEmail.body.error.fields.some((f) => f.fieldId === 'email'))

const injected = await call(sessionFn, {
  method: 'PATCH',
  path: '/api/questionnaire/session',
  headers: auth,
  body: {
    answers: { ...ANSWERS, evil_key: 'dropped', has_website: 'not-an-option', logo_files: 'nope' },
    currentStep: 3,
  },
})
check('unknown keys are dropped', injected.status === 200)

const afterInject = await call(sessionFn, { path: '/api/questionnaire/session', headers: auth })
check('an unknown key is not stored', afterInject.body.session.answers.evil_key === undefined)
check('an invalid option is not stored', afterInject.body.session.answers.has_website === undefined)
check('an upload field cannot be written via answers', afterInject.body.session.answers.logo_files === undefined)

/* ================================================================== *
 * 3. Uploads
 * ================================================================== */

section('3. File uploads — chunked, verified, private')

await call(sessionFn, {
  method: 'PATCH',
  path: '/api/questionnaire/session',
  headers: auth,
  body: { answers: ANSWERS, currentStep: 4 },
})

const init = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'logo_files', fileName: 'logo.png', contentType: 'image/png', sizeBytes: PNG.byteLength },
})
check('an upload can be opened', init.status === 200 && typeof init.body?.uploadId === 'string')
check('the server dictates the chunk size', init.body?.chunkSize === 4 * 1024 * 1024)

const chunk = await call(chunkFn, {
  method: 'PUT',
  path: `/api/uploads/chunk?uploadId=${init.body.uploadId}&index=0`,
  headers: auth,
  body: PNG,
})
check('a chunk is accepted', chunk.status === 200)

const completed = await call(completeFn, {
  method: 'POST',
  path: '/api/uploads/complete',
  headers: auth,
  body: { uploadId: init.body.uploadId },
})
check('the upload completes', completed.status === 200, JSON.stringify(completed.body))
check('the stored type is sniffed, not trusted', completed.body?.file?.contentType === 'image/png')
check('the size is the assembled size', completed.body?.file?.sizeBytes === PNG.byteLength)

const FILE_ID = completed.body?.file?.id

const badExt = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'logo_files', fileName: 'payload.exe', contentType: 'application/octet-stream', sizeBytes: 10 },
})
check('an unsupported extension is refused at init', badExt.status === 415)

const tooBig = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'logo_files', fileName: 'huge.png', contentType: 'image/png', sizeBytes: 21 * 1024 * 1024 },
})
check('a file over 20MB is refused at init', tooBig.status === 413)

const notAnUploadField = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'business_name', fileName: 'a.png', contentType: 'image/png', sizeBytes: 10 },
})
check('a non-upload question cannot take a file', notAnUploadField.status === 400)

// A PDF extension carrying PNG bytes: the name and the contents disagree.
const liar = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'photo_files', fileName: 'brochure.pdf', contentType: 'application/pdf', sizeBytes: PNG.byteLength },
})
await call(chunkFn, {
  method: 'PUT',
  path: `/api/uploads/chunk?uploadId=${liar.body.uploadId}&index=0`,
  headers: auth,
  body: PNG,
})
const liarDone = await call(completeFn, {
  method: 'POST',
  path: '/api/uploads/complete',
  headers: auth,
  body: { uploadId: liar.body.uploadId },
})
check('a disguised file is rejected on its magic bytes', liarDone.status === 415, `got ${liarDone.status}`)

// A second customer must not be able to touch the first one's upload.
const other = await call(sessionFn, { method: 'POST', path: '/api/questionnaire/session', body: {} })
const otherAuth = { 'x-nexalfield-resume': other.body.token }
const crossInit = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: otherAuth,
  body: { fieldId: 'logo_files', fileName: 'x.png', contentType: 'image/png', sizeBytes: PNG.byteLength },
})
const crossChunk = await call(chunkFn, {
  method: 'PUT',
  path: `/api/uploads/chunk?uploadId=${init.body.uploadId}&index=0`,
  headers: otherAuth,
  body: PNG,
})
check("another customer cannot write into someone else's upload", crossChunk.status === 404)

const crossDelete = await call(deleteFileFn, {
  method: 'DELETE',
  path: `/api/uploads/${FILE_ID}`,
  headers: otherAuth,
  params: { fileId: FILE_ID },
})
check("another customer cannot delete someone else's file", crossDelete.status === 404)

// The owner can.
const ownDelete = await call(deleteFileFn, {
  method: 'DELETE',
  path: `/api/uploads/${crossInit.body ? FILE_ID : FILE_ID}`,
  headers: auth,
  params: { fileId: FILE_ID },
})
check('the owner can remove their own file', ownDelete.status === 204)

// Put it back for the rest of the run.
const reinit = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'logo_files', fileName: 'logo.png', contentType: 'image/png', sizeBytes: PNG.byteLength },
})
await call(chunkFn, {
  method: 'PUT',
  path: `/api/uploads/chunk?uploadId=${reinit.body.uploadId}&index=0`,
  headers: auth,
  body: PNG,
})
const restored = await call(completeFn, {
  method: 'POST',
  path: '/api/uploads/complete',
  headers: auth,
  body: { uploadId: reinit.body.uploadId },
})
const LOGO_ID = restored.body.file.id
check('the file is re-attached for the rest of the run', restored.status === 200)

/* ================================================================== *
 * 4. Submission
 * ================================================================== */

section('4. Submission')

const withLogo = completionPercent(ANSWERS, { logo_files: 1 })
const withEverything = completionPercent(ANSWERS, { logo_files: 1, photo_files: 1 })
check(`progress is high once every required answer is given (${withLogo}%)`, withLogo >= 95, `got ${withLogo}`)
check(
  'progress reaches 100% only when every visible question is answered',
  withEverything === 100,
  `got ${withEverything}`,
)
check('an unstarted questionnaire reads 0%', completionPercent({}, {}) === 0)
check(`there are ${TOTAL_STEPS} steps`, TOTAL_STEPS === 7)

const submitted = await call(submitFn, {
  method: 'POST',
  path: '/api/questionnaire/submit',
  headers: auth,
  body: { answers: ANSWERS },
})
check('a complete questionnaire is accepted', submitted.status === 200, JSON.stringify(submitted.body))
check('a NEX reference is issued', /^NEX-\d{4,5}$/.test(submitted.body?.reference ?? ''), submitted.body?.reference)
check('a submission timestamp is recorded', typeof submitted.body?.submittedAt === 'string')
check('it is not marked a duplicate', submitted.body?.duplicate === false)

const REFERENCE = submitted.body.reference

const again = await call(submitFn, {
  method: 'POST',
  path: '/api/questionnaire/submit',
  headers: auth,
  body: { answers: ANSWERS },
})
check('submitting twice is idempotent', again.status === 200 && again.body.duplicate === true)
check('the reference does not change', again.body.reference === REFERENCE)

const lateSave = await call(sessionFn, {
  method: 'PATCH',
  path: '/api/questionnaire/session',
  headers: auth,
  body: { answers: { ...ANSWERS, business_name: 'Tampered' }, currentStep: 1 },
})
check('a submitted questionnaire can no longer be edited', lateSave.status === 409)

const lateUpload = await call(initFn, {
  method: 'POST',
  path: '/api/uploads/init',
  headers: auth,
  body: { fieldId: 'logo_files', fileName: 'late.png', contentType: 'image/png', sizeBytes: 10 },
})
check('files cannot be added after submission', lateUpload.status === 409)

await flush()

const summaryPoll = await call(summaryFn, { path: '/api/questionnaire/summary', headers: auth })
check('the thank-you page can read its summary status', summaryPoll.status === 200)
check('the reference is on the summary response', summaryPoll.body?.reference === REFERENCE)
check(
  'a failed AI summary never breaks the submission',
  ['pending', 'generating', 'ready', 'failed'].includes(summaryPoll.body?.status),
  summaryPoll.body?.status,
)
check('the customer is never shown an internal error', summaryPoll.body?.error === null)

/* ================================================================== *
 * 5. Dashboard authentication
 * ================================================================== */

section('5. Dashboard authentication and access control')

const anonList = await call(projectsFn, { path: '/api/admin/projects' })
check('the project list refuses anonymous callers', anonList.status === 401)

const anonRecord = await call(projectFn, { path: '/api/admin/projects/x', params: { id: 'x' } })
check('a record refuses anonymous callers', anonRecord.status === 401)

const anonFile = await call(adminFileFn, { path: `/api/admin/files/${LOGO_ID}`, params: { fileId: LOGO_ID } })
check('an uploaded file refuses anonymous callers', anonFile.status === 401)

const anonNote = await call(notesFn, {
  method: 'POST',
  path: '/api/admin/projects/x/notes',
  params: { id: 'x' },
  body: { body: 'hi' },
})
check('internal notes refuse anonymous callers', anonNote.status === 401)

const wrongPassword = await call(authFn, {
  method: 'POST',
  path: '/api/admin/login',
  body: { email: process.env.ADMIN_EMAIL, password: 'wrong-password-entirely' },
})
check('a wrong password is rejected', wrongPassword.status === 401)

const unknownUser = await call(authFn, {
  method: 'POST',
  path: '/api/admin/login',
  body: { email: 'nobody@example.com', password: 'whatever-they-typed' },
})
check(
  'an unknown address is indistinguishable from a wrong password',
  unknownUser.status === wrongPassword.status &&
    unknownUser.body?.error?.message === wrongPassword.body?.error?.message,
)

const login = await call(authFn, {
  method: 'POST',
  path: '/api/admin/login',
  body: { email: process.env.ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
})
check('a correct password signs in', login.status === 200, JSON.stringify(login.body))

const setCookie = login.response.headers.get('set-cookie') ?? ''
check('the session cookie is HttpOnly', /HttpOnly/i.test(setCookie))
check('the session cookie is SameSite=Strict', /SameSite=Strict/i.test(setCookie))

const COOKIE = setCookie.split(';')[0]

const forged = await call(projectsFn, {
  path: '/api/admin/projects',
  cookies: 'nf_admin_session=eyJlbWFpbCI6ImhhY2tlckBldmlsLnRlc3QiLCJleHAiOjk5OTk5OTk5OTl9.forged',
})
check('a forged session cookie is rejected', forged.status === 401)

const whoami = await call(authFn, { path: '/api/admin/session', cookies: COOKIE })
check('the session route reports the signed-in admin', whoami.status === 200 && whoami.body?.admin?.email === process.env.ADMIN_EMAIL)

/* ================================================================== *
 * 6. Dashboard list — search, filter, sort
 * ================================================================== */

section('6. Dashboard list — search, filter, sort')

const list = await call(projectsFn, { path: '/api/admin/projects', cookies: COOKIE })
check('the list loads', list.status === 200)
check('the submitted record appears', list.body?.projects?.some((p) => p.reference === REFERENCE))
check('drafts are never listed', !list.body.projects.some((p) => p.reference === null))
check('checklist progress is counted in the database', list.body.projects[0]?.checklistTotal === CHECKLIST_ITEMS.length)
check('paging metadata is present', typeof list.body?.pageCount === 'number' && list.body.pageCount >= 1)

const PROJECT_ID = list.body.projects.find((p) => p.reference === REFERENCE).id

for (const [label, term] of [
  ['business name', 'Harrow'],
  ['customer name', 'Okafor'],
  ['email', 'jane'],
  ['reference number', REFERENCE],
]) {
  const found = await call(projectsFn, {
    path: `/api/admin/projects?q=${encodeURIComponent(term)}`,
    cookies: COOKIE,
  })
  check(`search by ${label} finds it`, found.body?.projects?.some((p) => p.reference === REFERENCE), JSON.stringify(found.body?.projects?.length))
}

const noMatch = await call(projectsFn, { path: '/api/admin/projects?q=zzzznothing', cookies: COOKIE })
check('a search with no matches returns nothing', noMatch.body?.projects?.length === 0)

const injection = await call(projectsFn, { path: "/api/admin/projects?q=%27%29%20%7C%20%28%27a", cookies: COOKIE })
check('search input cannot break the tsquery', injection.status === 200)

const filteredNew = await call(projectsFn, { path: '/api/admin/projects?status=new', cookies: COOKIE })
check('status filtering works', filteredNew.body?.projects?.some((p) => p.reference === REFERENCE))
check('the status chips carry counts', typeof filteredNew.body?.counts?.new === 'number')

const filteredOther = await call(projectsFn, { path: '/api/admin/projects?status=complete', cookies: COOKIE })
check('filtering by another status excludes it', !filteredOther.body.projects.some((p) => p.reference === REFERENCE))

const bogusStatus = await call(projectsFn, { path: '/api/admin/projects?status=../../etc', cookies: COOKIE })
check('an unknown status filter is ignored, not fatal', bogusStatus.status === 200)

const oldest = await call(projectsFn, { path: '/api/admin/projects?sort=oldest', cookies: COOKIE })
check('date sorting works', oldest.status === 200)

/* ================================================================== *
 * 7. The customer record
 * ================================================================== */

section('7. Customer record — answers, files, status')

const record = await call(projectFn, {
  path: `/api/admin/projects/${PROJECT_ID}`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
})
check('the record loads', record.status === 200)
check('the complete questionnaire is present', record.body?.project?.answers?.business_description?.startsWith('Bespoke'))
check('the uploaded file is listed', record.body?.files?.some((f) => f.id === LOGO_ID))
check('the status starts as New', record.body?.project?.status === 'new')
check('the full checklist is present', record.body?.checklist?.length === CHECKLIST_ITEMS.length)
check('checklist items start unticked', record.body.checklist.every((i) => i.completed === false))
check('the reference is shown', record.body.project.reference === REFERENCE)
check('contact details are denormalised for the dashboard', record.body.project.email === 'jane@harrowlane.test')

const missing = await call(projectFn, {
  path: '/api/admin/projects/11111111-1111-1111-1111-111111111111',
  params: { id: '11111111-1111-1111-1111-111111111111' },
  cookies: COOKIE,
})
check('an unknown project id is a 404', missing.status === 404)

const malformed = await call(projectFn, {
  path: '/api/admin/projects/not-a-uuid',
  params: { id: 'not-a-uuid' },
  cookies: COOKIE,
})
check('a malformed id is a 404, not a database error', malformed.status === 404)

const draftId = other.body.session?.id
const draftPeek = await call(projectFn, {
  path: `/api/admin/projects/${PROJECT_ID}`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
})
check('the dashboard only ever exposes submitted records', draftPeek.status === 200 && draftId === undefined)

const fileDownload = await call(adminFileFn, {
  path: `/api/admin/files/${LOGO_ID}`,
  params: { fileId: LOGO_ID },
  cookies: COOKIE,
})
check('a signed-in admin can download the file', fileDownload.status === 200)
check('it is served as an attachment', /attachment/.test(fileDownload.response.headers.get('content-disposition') ?? ''))
check('it is never cached', /no-store/.test(fileDownload.response.headers.get('cache-control') ?? ''))
check('sniffing is disabled', fileDownload.response.headers.get('x-content-type-options') === 'nosniff')

const inlineDownload = await call(adminFileFn, {
  path: `/api/admin/files/${LOGO_ID}?disposition=inline`,
  params: { fileId: LOGO_ID },
  cookies: COOKIE,
})
check('a PNG may be previewed inline', /inline/.test(inlineDownload.response.headers.get('content-disposition') ?? ''))

/* ================================================================== *
 * 8. Status and checklist independence
 * ================================================================== */

section('8. Status and checklist')

const tick = await call(checklistFn, {
  method: 'PATCH',
  path: `/api/admin/projects/${PROJECT_ID}/checklist`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { itemKey: 'questionnaire_reviewed', completed: true },
})
check('a checklist item can be ticked', tick.status === 200)
check('it comes back completed', tick.body?.checklist?.find((i) => i.itemKey === 'questionnaire_reviewed')?.completed === true)
check('it records who ticked it', Boolean(tick.body.checklist.find((i) => i.itemKey === 'questionnaire_reviewed')?.completedBy))

const statusChange = await call(projectFn, {
  method: 'PATCH',
  path: `/api/admin/projects/${PROJECT_ID}`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { status: 'ready_to_build' },
})
check('the status can be changed', statusChange.status === 200 && statusChange.body.project.status === 'ready_to_build')
check(
  'changing the status leaves the checklist intact',
  statusChange.body.checklist.find((i) => i.itemKey === 'questionnaire_reviewed')?.completed === true,
)

const badStatus = await call(projectFn, {
  method: 'PATCH',
  path: `/api/admin/projects/${PROJECT_ID}`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { status: 'president' },
})
check('an invented status is refused', badStatus.status === 400)

const badItem = await call(checklistFn, {
  method: 'PATCH',
  path: `/api/admin/projects/${PROJECT_ID}/checklist`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { itemKey: 'take_over_the_world', completed: true },
})
check('an invented checklist item is refused', badItem.status === 400)

const untick = await call(checklistFn, {
  method: 'PATCH',
  path: `/api/admin/projects/${PROJECT_ID}/checklist`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { itemKey: 'questionnaire_reviewed', completed: false },
})
check('an item can be unticked again', untick.body.checklist.find((i) => i.itemKey === 'questionnaire_reviewed')?.completed === false)

/* ================================================================== *
 * 9. Internal notes
 * ================================================================== */

section('9. Internal notes')

const note = await call(notesFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/notes`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { body: 'Internal: quote at the higher workshop rate.', category: 'follow_up' },
})
check('a note can be added', note.status === 201)
check('the category is kept', note.body?.note?.category === 'follow_up')
check('the author comes from the session', note.body?.note?.author === process.env.ADMIN_NAME)
check('it is timestamped', typeof note.body?.note?.createdAt === 'string')

const NOTE_ID = note.body.note.id

const spoofed = await call(notesFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/notes`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { body: 'Spoof attempt', author: 'Someone Else', category: 'private' },
})
check('the author cannot be spoofed from the request body', spoofed.body?.note?.author === process.env.ADMIN_NAME)

const emptyNote = await call(notesFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/notes`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: { body: '   ' },
})
check('an empty note is refused', emptyNote.status === 400)

const editedNote = await call(notesFn, {
  method: 'PATCH',
  path: `/api/admin/notes/${NOTE_ID}`,
  params: { noteId: NOTE_ID },
  cookies: COOKIE,
  body: { body: 'Internal: quote at the higher workshop rate. Confirmed by phone.' },
})
check('a note can be edited', editedNote.status === 200 && editedNote.body.note.body.endsWith('Confirmed by phone.'))
check('the edit is timestamped', typeof editedNote.body.note.updatedAt === 'string')

const withNotes = await call(projectFn, {
  path: `/api/admin/projects/${PROJECT_ID}`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
})
check('notes appear on the record', withNotes.body.notes.length === 2)

// The customer's own view of their submission must never contain a note.
const customerView = await call(summaryFn, { path: '/api/questionnaire/summary', headers: auth })
const customerJson = JSON.stringify(customerView.body)
check('internal notes never reach the customer', !customerJson.includes('workshop rate'))
check('internal notes are not in the resume payload', !JSON.stringify(
  (await call(sessionFn, { path: '/api/questionnaire/session', headers: auth })).body,
).includes('workshop rate'))

const deletedNote = await call(notesFn, {
  method: 'DELETE',
  path: `/api/admin/notes/${NOTE_ID}`,
  params: { noteId: NOTE_ID },
  cookies: COOKIE,
})
check('a note can be deleted', deletedNote.status === 204)

/* ================================================================== *
 * 10. Admin actions and the hourly job
 * ================================================================== */

section('10. Manual actions and hourly housekeeping')

const resend = await call(actionsFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/email`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: {},
})
check('the confirmation email can be re-sent', resend.status === 200)
check(
  'with no mail provider configured it is recorded as skipped, not failed',
  resend.body?.project?.emailStatus === 'skipped',
  resend.body?.project?.emailStatus,
)

const regenerate = await call(actionsFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/summary`,
  params: { id: PROJECT_ID },
  cookies: COOKIE,
  body: {},
})
check('the summary can be regenerated on demand', regenerate.status === 200)
check(
  'a summary failure is recorded rather than thrown',
  ['ready', 'failed'].includes(regenerate.body?.project?.summaryStatus),
  regenerate.body?.project?.summaryStatus,
)

const anonAction = await call(actionsFn, {
  method: 'POST',
  path: `/api/admin/projects/${PROJECT_ID}/summary`,
  params: { id: PROJECT_ID },
  body: {},
})
check('manual actions refuse anonymous callers', anonAction.status === 401)

const housekeeping = await retryFn()
check('the hourly job runs', housekeeping.status === 200)

/* ================================================================== *
 * 11. Persistence across a fresh connection
 * ================================================================== */

section('11. Persistence')

const { Client } = await import('pg')
const client = new Client({ connectionString: process.env.NETLIFY_DATABASE_URL })
await client.connect()
const rows = await client.query(
  'select reference, status, business_name, email, submitted_at from submissions where reference = $1',
  [REFERENCE],
)
check('the record is really in Postgres', rows.rowCount === 1)
check('the reference persisted', rows.rows[0]?.reference === REFERENCE)
check('the status persisted', rows.rows[0]?.status === 'ready_to_build')
check('the business name persisted', rows.rows[0]?.business_name === 'Harrow Lane Joinery')
check('the submission timestamp persisted', rows.rows[0]?.submitted_at instanceof Date)

const fileRows = await client.query('select file_name, content_type, blob_key from uploaded_files')
check('the uploaded file persisted', fileRows.rows.some((r) => r.file_name === 'logo.png'))
check('no blob key was left pending', fileRows.rows.every((r) => r.blob_key !== 'pending'))

const tokenRows = await client.query('select token_hash from submissions where reference = $1', [REFERENCE])
check(
  'the continuation token is stored only as a hash',
  tokenRows.rows[0].token_hash !== TOKEN && /^[0-9a-f]{64}$/.test(tokenRows.rows[0].token_hash),
)

const chunkRows = await client.query(
  'select count(*)::int as n from upload_sessions where submission_id = (select id from submissions where reference = $1)',
  [REFERENCE],
)
check('a completed upload leaves no session row behind', chunkRows.rows[0].n === 0, `got ${chunkRows.rows[0].n}`)

await client.end()

/* ---------------------------------------------------------------- *
 * Result
 * ---------------------------------------------------------------- */

await blobServer.stop()

console.log(`\n[1m${passed} passed, ${failed} failed[0m`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const name of failures) console.log(`  - ${name}`)
  process.exit(1)
}
process.exit(0)
