/**
 * Netlify Database (Postgres) schema.
 *
 * Run `npm run db:generate` after editing this file, then apply the generated
 * SQL in netlify/database/migrations. Nothing here is created at runtime — a
 * function that finds a missing table should fail loudly rather than quietly
 * inventing one.
 */
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { Answers } from '../shared/questionnaire'

/* ------------------------------------------------------------------ *
 * Submissions
 * ------------------------------------------------------------------ */

export interface StoredSummary {
  businessName: string
  overview: string
  websiteGoals: string[]
  requestedPages: string[]
  brandingPreferences: string[]
  contentAvailable: string[]
  specialRequests: string[]
  generatedAt?: string
  model?: string
}

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The continuation token is never stored in the clear. A leaked database
     * backup therefore does not hand anyone access to a draft questionnaire.
     */
    tokenHash: text('token_hash').notNull(),

    /** NEX-XXXX. Assigned at submission, not when the draft is created. */
    reference: text('reference'),

    status: text('status').notNull().default('draft'),

    /* Denormalised from `answers` so the dashboard can search and sort in the
     * database rather than pulling every JSON document into a function. */
    contactName: text('contact_name'),
    businessName: text('business_name'),
    email: text('email'),
    phone: text('phone'),

    answers: jsonb('answers').$type<Answers>().notNull().default(sql`'{}'::jsonb`),

    currentStep: integer('current_step').notNull().default(1),
    furthestStep: integer('furthest_step').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSavedAt: timestamp('last_saved_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Abandoned drafts stop being resumable; submitted records never expire. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    summary: jsonb('summary').$type<StoredSummary | null>(),
    summaryStatus: text('summary_status').notNull().default('pending'),
    summaryError: text('summary_error'),
    summaryAttempts: integer('summary_attempts').notNull().default(0),
    summaryUpdatedAt: timestamp('summary_updated_at', { withTimezone: true }),

    emailStatus: text('email_status').notNull().default('pending'),
    emailError: text('email_error'),
    emailAttempts: integer('email_attempts').notNull().default(0),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
    emailProvider: text('email_provider'),
  },
  (table) => [
    uniqueIndex('submissions_token_hash_key').on(table.tokenHash),
    uniqueIndex('submissions_reference_key').on(table.reference),
    // The dashboard's default view: submitted records, newest first.
    index('submissions_status_submitted_idx').on(table.status, table.submittedAt.desc()),
    index('submissions_submitted_at_idx').on(table.submittedAt.desc()),
    index('submissions_expires_at_idx').on(table.expiresAt),
    /**
     * Search across the four fields the dashboard offers, as a full-text index
     * so it still returns one page at ten thousand records.
     *
     * Hyphens are replaced with spaces before tokenising. Postgres reads
     * `NEX-4821` as the two lexemes `nex` and `-4821` — a word and a *signed
     * integer* — so searching for `4821` would never match the reference it
     * came from. Splitting on the hyphen first gives `nex` and `4821`, which
     * is what someone typing a reference number expects. It helps hyphenated
     * business names for the same reason.
     *
     * `admin-projects.mts` builds its query with the identical expression;
     * they have to match character for character or this index goes unused.
     */
    index('submissions_search_idx').using(
      'gin',
      sql`to_tsvector('simple', replace(coalesce(${table.businessName}, '') || ' ' || coalesce(${table.contactName}, '') || ' ' || coalesce(${table.email}, '') || ' ' || coalesce(${table.reference}, ''), '-', ' '))`,
    ),
  ],
)

/* ------------------------------------------------------------------ *
 * Uploaded files
 * ------------------------------------------------------------------ */

export const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    fieldId: text('field_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Key in the private Netlify Blobs store. Never exposed to a browser. */
    blobKey: text('blob_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('uploaded_files_submission_idx').on(table.submissionId, table.createdAt),
    uniqueIndex('uploaded_files_blob_key_key').on(table.blobKey),
  ],
)

/* ------------------------------------------------------------------ *
 * In-flight chunked uploads
 * ------------------------------------------------------------------ */

export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    fieldId: text('field_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    chunkSize: integer('chunk_size').notNull(),
    totalChunks: integer('total_chunks').notNull(),
    receivedChunks: integer('received_chunks').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('upload_sessions_submission_idx').on(table.submissionId),
    index('upload_sessions_expires_idx').on(table.expiresAt),
  ],
)

/* ------------------------------------------------------------------ *
 * Internal notes — NexalField only, never sent to a customer
 * ------------------------------------------------------------------ */

export const internalNotes = pgTable(
  'internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    category: text('category').notNull().default('private'),
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [index('internal_notes_submission_idx').on(table.submissionId, table.createdAt.desc())],
)

/* ------------------------------------------------------------------ *
 * Build checklist
 * ------------------------------------------------------------------ */

export const checklistItems = pgTable(
  'checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),
  },
  (table) => [
    uniqueIndex('checklist_items_submission_key').on(table.submissionId, table.itemKey),
    index('checklist_items_submission_idx').on(table.submissionId, table.position),
  ],
)

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Stored objects
 * ------------------------------------------------------------------ */

/** Postgres has no first-class Drizzle type for raw bytes. */
const bytea = customType<{ data: Buffer; driverData: Buffer; default: false }>({
  dataType() {
    return 'bytea'
  },
})

/**
 * Uploaded file contents, and the parts of an upload still in flight.
 *
 * Used wherever Netlify Blobs is not available — see netlify/lib/storage.ts.
 * Keeping bytes here means a deployment needs one service rather than two, and
 * the rows are no more reachable than the rest of the data: every read goes
 * through a function that has already authorised the caller.
 */
export const blobObjects = pgTable(
  'blob_objects',
  {
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    bytes: bytea('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.bucket, table.key] }),
    // Sweeping abandoned upload parts.
    index('blob_objects_bucket_created_idx').on(table.bucket, table.createdAt),
  ],
)

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const submissionRelations = relations(submissions, ({ many }) => ({
  files: many(uploadedFiles),
  notes: many(internalNotes),
  checklist: many(checklistItems),
}))

export const uploadedFileRelations = relations(uploadedFiles, ({ one }) => ({
  submission: one(submissions, {
    fields: [uploadedFiles.submissionId],
    references: [submissions.id],
  }),
}))

export const internalNoteRelations = relations(internalNotes, ({ one }) => ({
  submission: one(submissions, {
    fields: [internalNotes.submissionId],
    references: [submissions.id],
  }),
}))

export const checklistItemRelations = relations(checklistItems, ({ one }) => ({
  submission: one(submissions, {
    fields: [checklistItems.submissionId],
    references: [submissions.id],
  }),
}))

export type Submission = typeof submissions.$inferSelect
export type UploadedFile = typeof uploadedFiles.$inferSelect
export type UploadSession = typeof uploadSessions.$inferSelect
export type InternalNote = typeof internalNotes.$inferSelect
export type ChecklistItem = typeof checklistItems.$inferSelect
export type BlobObject = typeof blobObjects.$inferSelect
