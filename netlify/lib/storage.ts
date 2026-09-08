/**
 * Private storage for uploaded files, and for the parts of an upload still in
 * flight.
 *
 * Two backends behind one small interface:
 *
 * - **Netlify Blobs**, where the platform provides it.
 * - **Postgres**, everywhere else. Bytes go into `blob_objects` alongside the
 *   rest of the data.
 *
 * Postgres is the portable default deliberately: it means deploying this
 * anywhere needs one service, not two, and the privacy guarantee is unchanged —
 * neither backend is reachable without going through a function that has
 * already authorised the caller. The trade is database size. A logo and a few
 * photos per customer is nothing; if this ever stores thousands of large
 * images, move that bucket to real object storage and only this file changes.
 */
import { getStore } from '@netlify/blobs'
import { and, eq, lt } from 'drizzle-orm'
import { blobObjects } from '../../db/schema.ts'
import { getDb } from './db.ts'

/** What the upload routes need, and nothing more. */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
}

export type Bucket = 'files' | 'chunks'

const NETLIFY_STORE_NAME: Record<Bucket, string> = {
  files: 'nexalfield-uploads',
  chunks: 'nexalfield-upload-chunks',
}

function onNetlify(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV)
}

/* ------------------------------------------------------------------ *
 * Netlify Blobs
 * ------------------------------------------------------------------ */

function netlifyStore(bucket: Bucket): ObjectStore {
  // Strong consistency: a file must be readable the instant it is written, or
  // the dashboard would 404 on a record the customer has just submitted.
  const store = getStore({ name: NETLIFY_STORE_NAME[bucket], consistency: 'strong' })

  return {
    async put(key, bytes) {
      // Copied into its own ArrayBuffer: Blob rejects a view whose backing
      // buffer might be shared.
      await store.set(key, new Blob([new Uint8Array(bytes)]))
    },
    async get(key) {
      const value = await store.get(key, { type: 'arrayBuffer' })
      return value ? new Uint8Array(value) : null
    },
    async delete(key) {
      await store.delete(key)
    },
  }
}

/* ------------------------------------------------------------------ *
 * Postgres
 * ------------------------------------------------------------------ */

function postgresStore(bucket: Bucket): ObjectStore {
  return {
    async put(key, bytes) {
      const db = getDb()
      await db
        .insert(blobObjects)
        .values({ bucket, key, bytes: Buffer.from(bytes) })
        // A retried chunk overwrites rather than colliding.
        .onConflictDoUpdate({
          target: [blobObjects.bucket, blobObjects.key],
          set: { bytes: Buffer.from(bytes), createdAt: new Date() },
        })
    },

    async get(key) {
      const db = getDb()
      const [row] = await db
        .select({ bytes: blobObjects.bytes })
        .from(blobObjects)
        .where(and(eq(blobObjects.bucket, bucket), eq(blobObjects.key, key)))
        .limit(1)
      return row ? new Uint8Array(row.bytes) : null
    },

    async delete(key) {
      const db = getDb()
      await db
        .delete(blobObjects)
        .where(and(eq(blobObjects.bucket, bucket), eq(blobObjects.key, key)))
    },
  }
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

export function store(bucket: Bucket): ObjectStore {
  return onNetlify() ? netlifyStore(bucket) : postgresStore(bucket)
}

export const filesStore = (): ObjectStore => store('files')
export const chunksStore = (): ObjectStore => store('chunks')

/** Removes an object. A failure here must never block the database write. */
export async function deleteQuietly(target: ObjectStore, key: string): Promise<void> {
  try {
    await target.delete(key)
  } catch (error) {
    console.error('Could not delete stored object', key, error)
  }
}

/**
 * Drops chunk objects left behind by uploads that were never completed. Only
 * meaningful for the Postgres backend; on Netlify the hourly job deletes the
 * chunks it knows about by key.
 */
export async function prunePostgresChunks(olderThanMs: number): Promise<number> {
  if (onNetlify()) return 0
  const db = getDb()
  const removed = await db
    .delete(blobObjects)
    .where(
      and(
        eq(blobObjects.bucket, 'chunks'),
        lt(blobObjects.createdAt, new Date(Date.now() - olderThanMs)),
      ),
    )
    .returning({ key: blobObjects.key })
  return removed.length
}
