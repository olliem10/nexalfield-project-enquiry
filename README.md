# NexalField — Website Project Questionnaire

A client onboarding platform for [NexalField](https://www.nexalfield.com): a public,
multi-step project questionnaire for customers, and a private dashboard where
NexalField reviews what they submit.

This is a standalone application. It does not touch, replace, or proxy the
existing nexalfield.com marketing site.

## The two experiences

| Route | Who | What |
| --- | --- | --- |
| `/questionnaire` | Customers, no login | 7-section wizard, ~10–15 minutes, progress saved server-side, file uploads, review stage, submission |
| `/dashboard` | NexalField only, password | Submission list with server-side search/filter/sort, full customer record, secure file access, AI summary, status, internal notes, build checklist |

Customers have no route into the dashboard. Every `/api/admin/*` endpoint
verifies the signed session cookie server-side before it touches the database,
so hiding the UI is never the thing keeping data private.

## Stack

- **Vite 7 + React 19 + TypeScript**, `react-router-dom` 7. The dashboard is
  behind `React.lazy`, so admin code is never in the customer bundle.
- **One Vercel Function serves the whole API.** The handlers are plain
  `Request` in, `Response` out; `api/[...path].ts` matches every `/api/*`
  request against the routing table `server/lib/router.ts` builds from each
  function's own `config`.
- **Postgres** via **Drizzle ORM** (stable 0.45). Migrations in
  `db/migrations`, applied by hand with `npm run db:migrate` — see below.
- **Uploaded files** go to Postgres too (`blob_objects`) — see
  `server/lib/storage.ts`. The table is never web-addressable: the only way to
  read a file is through a function that has already authorised the caller.
- **Claude** (`claude-opus-5` by default, `AI_SUMMARY_MODEL` to override) for
  project summaries, via a plain `ANTHROPIC_API_KEY`. Without one, submission
  still succeeds and the summary is marked pending.
- **Resend or SMTP** for the confirmation email.

## Layout

```
index.html                Single-page app shell.
shared/questionnaire.ts   Single source of truth for all 7 sections and every question.
                          Drives the wizard, client + server validation, the review
                          stage, dashboard rendering and the AI prompt. Add a question
                          here and it appears everywhere.
db/schema.ts              Drizzle schema: submissions, uploaded_files, upload_sessions,
                          internal_notes, checklist_items, rate_limits.
db/migrations/            SQL migrations, applied by hand with `npm run db:migrate`.
server/lib/               Shared server code — http, auth, session, answers, uploads,
                          email, ai, tasks.
server/functions/         15 functions. Routes are declared in each file's
                          `export const config`.
api/                      Vercel entry points: the catch-all, and the cron target.
scripts/                  hash-password, migrate, and the test harnesses.
src/questionnaire/        Customer wizard.
src/dashboard/            Admin dashboard (lazy-loaded).
src/components/           Reusable UI, including one control per question type.
```

## API

Customer (no auth; a session is identified by an opaque resume token sent in the
`x-nexalfield-resume` header):

```
POST   /api/questionnaire/session      start a draft
GET    /api/questionnaire/session      resume a draft
PATCH  /api/questionnaire/session      autosave
POST   /api/questionnaire/submit       final submit (idempotent)
GET    /api/questionnaire/summary      reference + AI summary for the thank-you page
POST   /api/uploads/init               open a chunked upload
POST   /api/uploads/chunk              upload one 4MB chunk
POST   /api/uploads/complete           assemble and verify
DELETE /api/uploads/:fileId            remove a file
```

`/api/uploads/:fileId` declares `excludedPath` for `init`, `chunk` and
`complete`, so the parameter never swallows those three literal routes
whatever order the router happens to try them in.

Admin (all require the `nf_admin_session` cookie):

```
POST   /api/admin/login | /api/admin/logout
GET    /api/admin/session
GET    /api/admin/projects             server-side search, filter, sort, paginate
GET    /api/admin/projects/:id         full record
PATCH  /api/admin/projects/:id         change status
GET    /api/admin/files/:fileId        stream a file (attachment, no-store)
POST   /api/admin/projects/:id/notes   internal notes
DELETE /api/admin/notes/:noteId
PATCH  /api/admin/projects/:id/checklist
POST   /api/admin/projects/:id/summary regenerate the AI summary
POST   /api/admin/projects/:id/email   resend the confirmation email
```

`retry-outstanding.ts` runs once a day, via the Vercel Cron target at
`api/cron/retry.ts`, and retries summaries and emails that failed earlier.

## Design decisions worth knowing before you change things

- **Continuation tokens are opaque.** 43 characters of randomness, stored only
  as a SHA-256 hash. No database ID ever appears in a URL, and a token grants
  access to exactly one questionnaire — verified server-side, never trusted from
  the client.
- **Uploads are chunked at 4MB** because a function request body is capped at
  6MB. The 20MB per-file limit is enforced on the client, at `init`, at each
  chunk, and again on the assembled file. Content type is confirmed by reading
  magic bytes, not by trusting the browser.
- **Answers are normalised server-side** (`server/lib/answers.ts`). Unknown
  keys are dropped, so a stored answer document cannot smuggle arbitrary data
  into a record. File attachments live in `uploaded_files`, never in `answers`.
- **Submission never fails because something downstream did.** A failed AI
  summary or email is recorded as pending/failed and retried; the customer still
  gets their reference number.
- **Status and checklist are independent.** Changing status writes only the
  status column, so checklist progress survives every transition.
- **References are `NEX-XXXX`** drawn at random, not from a sequence — they
  reveal nothing about how many customers exist or in what order they arrived.
  Collisions are checked for, and the reference widens a digit rather than
  failing a submission.

## Running it locally

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL, SESSION_SECRET and the ADMIN_* values
npm run hash-password -- "your admin password"   # → ADMIN_PASSWORD_HASH
npm run db:migrate        # apply the schema to that database
npm run build && npm run start:local
```

`scripts/local-server.mjs` serves the built site on :8888 and dispatches
`/api/*` to `api/[...path].ts` — the same entry point Vercel calls — so this
runs the deployed code path, not a stand-in.

You need your own Postgres database (a local instance, or a free-tier Neon
one) — nothing provisions one for you locally. If it's a local instance with
no password, set `PGUSER=postgres` (see `.env.example`): otherwise functions
fail with `user is required`. Not needed in production.

```bash
npm run typecheck    # tsc across the app and the server
npm run db:generate  # new migration after editing db/schema.ts
npm run db:migrate   # apply migrations by hand — never run by the build
```

## Tests

Three harnesses, all running against real infrastructure rather than mocks.

```bash
npm test             # typecheck + the API suite
npm run test:api     # 127 checks: every endpoint, against a real Postgres database
npm run test:email   # sends the confirmation through a throwaway SMTP server
npm run test:browser # drives the whole thing in Chromium, phone and desktop
```

`test:api` and `test:email` need `DATABASE_URL` and the `ADMIN_*` variables.
`test:browser` additionally needs `npm run start:local` running, and writes
screenshots to `.screenshots/`.

## Deploying

Vercel is the only supported host. `vercel.json` sets the build, the
single-page-app rewrite, the security headers and the cron. Provision a
Postgres database (Neon's free tier is enough) and set:

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | everything |
| `SESSION_SECRET` | the dashboard |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD_HASH` | the dashboard |
| `RESEND_API_KEY` *or* the `SMTP_*` set | the confirmation email |
| `ANTHROPIC_API_KEY` | the AI project summary |
| `CRON_SECRET` | protecting `/api/cron/retry` |

Only `DATABASE_URL` is required to fill in and submit the questionnaire; the
rest degrade gracefully and are reported in the dashboard.

Migrations are not run by the build. Apply them once with
`DATABASE_URL=… npm run db:migrate`.

The cron in `vercel.json` runs once a day (`0 3 * * *`) rather than hourly,
because Vercel's Hobby tier only allows daily cron schedules — a finer
schedule needs the Pro plan.

### Migrations should stay safe to re-run

Nothing re-applies a migration automatically, but `npm run db:migrate` can
still be run more than once by hand, so each migration file uses
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and a
`DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;` block around each
`ADD CONSTRAINT`, since Postgres has no `IF NOT EXISTS` for those.
`0000_initial_schema.sql` is the worked example.

### One thing to replace

`public/assets/img/nexalfield-logo.png` and `favicon.svg` are placeholders — an
"N" monogram on the brand green. Drop the real NexalField logo in at those two
paths when convenient; nothing else needs changing.
