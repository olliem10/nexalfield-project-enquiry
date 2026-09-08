-- Idempotent, like 0000 — see the note at the top of that file. Netlify's
-- database extension and Drizzle keep separate migration trackers, so any
-- migration here has to survive being presented twice.

CREATE TABLE IF NOT EXISTS "blob_objects" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blob_objects_bucket_key_pk" PRIMARY KEY("bucket","key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blob_objects_bucket_created_idx" ON "blob_objects" USING btree ("bucket","created_at");