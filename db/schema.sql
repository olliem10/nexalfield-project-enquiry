-- NexalField — Website Project Enquiry
-- Idempotent schema for the single "enquiries" table.
-- Applied via scripts/migrate.mjs against DATABASE_URL.

CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'draft',
  current_step INTEGER NOT NULL DEFAULT 1,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ
);
