-- Idempotent by design.
--
-- Netlify's database extension runs the files in this directory itself, after
-- the build. Its migration tracker is separate from Drizzle's, so a migration
-- Drizzle has already applied can still be presented to it as pending — which
-- is exactly what happened here: 0000 ran twice and the second run failed on
-- `relation "checklist_items" already exists`, taking the whole deploy with it.
--
-- Every statement below is therefore safe to re-run against a database that
-- already has this schema. Nothing is dropped and no data is touched; a second
-- run simply does nothing. Later migrations should follow the same rule.

CREATE TABLE IF NOT EXISTS "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'private' NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"contact_name" text,
	"business_name" text,
	"email" text,
	"phone" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"furthest_step" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_saved_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"summary" jsonb,
	"summary_status" text DEFAULT 'pending' NOT NULL,
	"summary_error" text,
	"summary_attempts" integer DEFAULT 0 NOT NULL,
	"summary_updated_at" timestamp with time zone,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_error" text,
	"email_attempts" integer DEFAULT 0 NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_provider" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"chunk_size" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"received_chunks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checklist_items_submission_key" ON "checklist_items" USING btree ("submission_id","item_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_items_submission_idx" ON "checklist_items" USING btree ("submission_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internal_notes_submission_idx" ON "internal_notes" USING btree ("submission_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submissions_token_hash_key" ON "submissions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submissions_reference_key" ON "submissions" USING btree ("reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_status_submitted_idx" ON "submissions" USING btree ("status","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submitted_at_idx" ON "submissions" USING btree ("submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_expires_at_idx" ON "submissions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_search_idx" ON "submissions" USING gin (to_tsvector('simple', replace(coalesce("business_name", '') || ' ' || coalesce("contact_name", '') || ' ' || coalesce("email", '') || ' ' || coalesce("reference", ''), '-', ' ')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_sessions_submission_idx" ON "upload_sessions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_sessions_expires_idx" ON "upload_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uploaded_files_submission_idx" ON "uploaded_files" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uploaded_files_blob_key_key" ON "uploaded_files" USING btree ("blob_key");