/**
 * Private storage for uploaded files, and for the parts of an upload still in
 * flight.
 *
 * Bytes go into `blob_objects` alongside the rest of the data — one service
 * to deploy, not two, and the privacy guarantee is unchanged: the table is
 * never reachable without going through a function that has already
 * authorised the caller. The trade is database size. A logo and a few photos
 * per customer is nothing; if this ever stores thousands of large images,
 * move that bucket to real object storage and only this file changes.
 *
 * `getStream` exists alongside the buffered `get` for one reason: serving a
 * file back to the dashboard. There is no partial/range read on a single
 * `bytea` column without a much bigger change than this fix calls for, so this
 * still does one buffered database read — but the response to the browser is
 * a genuine streamed `Response` rather than one large buffered body, which is
 * what lets it clear a serverless host's response-size ceiling for buffered
 * responses in the first place.
 */
import { and, eq, lt } from 'drizzle-orm'
import { blobObjects } from '../../db/schema.js'
import { getDb } from './db.js'

/** What the upload routes need, and nothing more. */
export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  /** For serving a file back out. See the file-level comment above. */
  getStream(key: string): Promise<ReadableStream<Uint8Array> | null>
  delete(key: string): Promise<void>
}

export type Bucket = 'files' | 'chunks'

/** 64KB pieces are small enough to keep peak memory bounded while streaming out. */
const STREAM_CHUNK_BYTES = 64 * 1024

function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(offset + STREAM_CHUNK_BYTES, bytes.byteLength)
      controller.enqueue(bytes.subarray(offset, end))
      offset = end
    },
  })
}

function postgresStore(bucket: Bucket): ObjectStore {
  async function fetchBytes(key: string): Promise<Uint8Array | null> {
    const db = getDb()
    const [row] = await db
      .select({ bytes: blobObjects.bytes })
      .from(blobObjects)
      .where(and(eq(blobObjects.bucket, bucket), eq(blobObjects.key, key)))
      .limit(1)
    return row ? new Uint8Array(row.bytes) : null
  }

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

    get: fetchBytes,

    async getStream(key) {
      const bytes = await fetchBytes(key)
      return bytes ? bytesToStream(bytes) : null
    },

    async delete(key) {
      const db = getDb()
      await db
        .delete(blobObjects)
        .where(and(eq(blobObjects.bucket, bucket), eq(blobObjects.key, key)))
    },
  }
}

export function store(bucket: Bucket): ObjectStore {
  return postgresStore(bucket)
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

/** Drops chunk objects left behind by uploads that were never completed. */
export async function prunePostgresChunks(olderThanMs: number): Promise<number> {
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
