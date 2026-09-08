import { defineConfig } from 'drizzle-kit'

/**
 * Migrations live in netlify/database/migrations so that `netlify dev` and the
 * production Netlify Database are driven by exactly the same SQL.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './netlify/database/migrations',
  dbCredentials: {
    url: process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
