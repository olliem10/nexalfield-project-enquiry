/**
 * File uploads.
 *
 * Files go into a Netlify Blobs store that has no public URL of any kind. The
 * only way to read one back is through `admin-file.mts`, which authenticates
 * the caller first — so an upload is private by construction rather than by
 * an unguessable address.
 *
 * A function request body is capped at 6MB, so each file is sliced into 4MB
 * parts by the browser, buffered here, then assembled and verified. The 20MB
 * limit is enforced four times over: in the browser, when the upload is opened,
 * on each part as it arrives, and finally on the assembled bytes.
 */
import { getStore, type Store } from '@netlify/blobs'
import { MAX_UPLOAD_BYTES, resolveUploadType, type UploadType } from '../../shared/questionnaire.ts'
import { HttpError } from './http.ts'

const FILES_STORE = 'nexalfield-uploads'
const CHUNKS_STORE = 'nexalfield-upload-chunks'

export function filesStore(): Store {
  // Strong consistency: a file must be readable the instant it is written, or
  // the dashboard would 404 on a record the customer has just submitted.
  return getStore({ name: FILES_STORE, consistency: 'strong' })
}

export function chunksStore(): Store {
  return getStore({ name: CHUNKS_STORE, consistency: 'strong' })
}

export function blobKey(submissionId: string, fileId: string): string {
  return `${submissionId}/${fileId}`
}

export function chunkKey(uploadId: string, index: number): string {
  return `${uploadId}/${String(index).padStart(5, '0')}`
}

/**
 * Strips anything that could be used to escape a directory, smuggle a
 * different extension past a viewer, or break a Content-Disposition header.
 */
export function safeFileName(raw: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'upload').slice(0, 180)
}

/**
 * Confirms what a file really is by reading its leading bytes.
 *
 * The browser's Content-Type is a claim, not evidence: a renamed executable
 * arrives looking exactly like a PNG. This is the check that decides.
 */
export function sniffContentType(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]): boolean =>
    signature.length <= bytes.length && signature.every((byte, index) => bytes[index] === byte)

  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'

  // SVG is text: look for an <svg> element near the start, past any BOM,
  // XML declaration, doctype or comment.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (/^<(\?xml|!doctype svg|!--|svg)/i.test(head) && /<svg[\s>]/i.test(head)) {
    return 'image/svg+xml'
  }

  return null
}

export interface VerifiedUpload {
  contentType: string
  type: UploadType
}

/**
 * The final gate before bytes are stored: the extension the customer sent and
 * the file's actual content must agree, and both must be a type we accept.
 */
export function verifyUpload(fileName: string, bytes: Uint8Array): VerifiedUpload {
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'empty_file', 'That file appears to be empty.')
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'file_too_large', 'Files need to be 20MB or smaller.')
  }

  const declared = resolveUploadType(fileName)
  if (!declared) {
    throw new HttpError(
      415,
      'unsupported_type',
      'Only PNG, JPG, SVG and PDF files can be uploaded.',
    )
  }

  const actual = sniffContentType(bytes)
  if (!actual) {
    throw new HttpError(
      415,
      'unsupported_type',
      'We could not read that file as a PNG, JPG, SVG or PDF. Please check it and try again.',
    )
  }

  if (actual !== declared.contentType) {
    throw new HttpError(
      415,
      'type_mismatch',
      `That file is named like a ${declared.label} but its contents are not. Please rename it correctly or upload a different file.`,
    )
  }

  return { contentType: actual, type: declared }
}

/**
 * How a stored file may be sent back to the dashboard.
 *
 * SVG is never served inline: it is an executable document in a browser, and
 * rendering a customer-supplied one on our own origin would hand any script
 * inside it the dashboard session. It is always a download instead.
 */
export function dispositionFor(contentType: string, wantsInline: boolean): 'inline' | 'attachment' {
  if (!wantsInline) return 'attachment'
  return contentType === 'image/png' ||
    contentType === 'image/jpeg' ||
    contentType === 'application/pdf'
    ? 'inline'
    : 'attachment'
}

/** RFC 5987 encoding, so a file with an accented name still downloads correctly. */
export function contentDispositionHeader(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** Removes a file's bytes. A failure here must never block the database write. */
export async function deleteBlobQuietly(store: Store, key: string): Promise<void> {
  try {
    await store.delete(key)
  } catch (error) {
    console.error('Could not delete blob', key, error)
  }
}
