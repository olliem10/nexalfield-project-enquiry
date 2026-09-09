// Applies db/schema.sql against DATABASE_URL.
// Usage: npm run db:migrate

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Client } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const sql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8')

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: true },
  })

  await client.connect()
  try {
    await client.query(sql)
    console.log('Migration applied successfully.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
