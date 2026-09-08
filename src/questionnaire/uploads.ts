import { useCallback, useMemo, useRef, useState } from 'react'
import {
  MAX_FILES_PER_FIELD,
  MAX_UPLOAD_BYTES,
  resolveUploadType,
  type FileCounts,
} from '@shared/questionnaire'
import { ApiError, api, putBytes } from '../lib/api'

export interface StoredFile {
  id: string
  fieldId: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface PendingUpload {
  key: string
  fieldId: string
  fileName: string
  sizeBytes: number
  /** 0–100, advanced as each chunk is acknowledged. */
  progress: number
  status: 'uploading' | 'error'
  error?: string
  file: File
}

interface InitResponse {
  uploadId: string
  chunkSize: number
  totalChunks: number
}

let counter = 0

function nextKey(): string {
  counter += 1
  return `upload-${Date.now()}-${counter}`
}

/**
 * Chunked upload client. A single function request is capped at 6MB, so each
 * file is sliced into 4MB parts, sent one at a time, then assembled and
 * verified server-side. Progress, retry and removal are all per-file.
 */
export function useUploads(token: string | null, initial: StoredFile[] = []) {
  const [files, setFiles] = useState<StoredFile[]>(initial)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const tokenRef = useRef(token)
  tokenRef.current = token

  const patch = useCallback((key: string, changes: Partial<PendingUpload>) => {
    setPending((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }, [])

  const send = useCallback(
    async (entry: PendingUpload) => {
      const activeToken = tokenRef.current
      if (!activeToken) {
        patch(entry.key, { status: 'error', error: 'Your session has expired. Please reload.' })
        return
      }

      try {
        patch(entry.key, { status: 'uploading', progress: 2, error: undefined })

        const init = await api<InitResponse>('/api/uploads/init', {
          method: 'POST',
          token: activeToken,
          body: {
            fieldId: entry.fieldId,
            fileName: entry.fileName,
            contentType: entry.file.type,
            sizeBytes: entry.sizeBytes,
          },
        })

        for (let index = 0; index < init.totalChunks; index += 1) {
          const start = index * init.chunkSize
          const slice = entry.file.slice(start, Math.min(start + init.chunkSize, entry.sizeBytes))
          await putBytes(
            `/api/uploads/chunk?uploadId=${encodeURIComponent(init.uploadId)}&index=${index}`,
            slice,
            activeToken,
          )
          patch(entry.key, {
            progress: Math.min(96, Math.round(((index + 1) / init.totalChunks) * 94) + 2),
          })
        }

        const completed = await api<{ file: StoredFile }>('/api/uploads/complete', {
          method: 'POST',
          token: activeToken,
          body: { uploadId: init.uploadId },
        })

        patch(entry.key, { progress: 100 })
        setFiles((rows) => [...rows, completed.file])
        setPending((rows) => rows.filter((row) => row.key !== entry.key))
      } catch (error) {
        patch(entry.key, {
          status: 'error',
          error:
            error instanceof ApiError
              ? error.message
              : 'That file could not be uploaded. Please try again.',
        })
      }
    },
    [patch],
  )

  const addFiles = useCallback(
    (fieldId: string, incoming: File[]) => {
      const already =
        files.filter((file) => file.fieldId === fieldId).length +
        pending.filter((row) => row.fieldId === fieldId).length

      const queued: PendingUpload[] = []
      const rejected: PendingUpload[] = []

      incoming.forEach((file, index) => {
        const entry: PendingUpload = {
          key: nextKey(),
          fieldId,
          fileName: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: 'uploading',
          file,
        }

        if (already + queued.length + index >= MAX_FILES_PER_FIELD) {
          rejected.push({
            ...entry,
            status: 'error',
            error: `You can attach up to ${MAX_FILES_PER_FIELD} files here.`,
          })
          return
        }
        if (!resolveUploadType(file.name, file.type)) {
          rejected.push({
            ...entry,
            status: 'error',
            error: 'Only PNG, JPG, SVG and PDF files can be uploaded.',
          })
          return
        }
        if (file.size <= 0) {
          rejected.push({ ...entry, status: 'error', error: 'That file appears to be empty.' })
          return
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          rejected.push({
            ...entry,
            status: 'error',
            error: 'Files need to be 20MB or smaller. Please compress it and try again.',
          })
          return
        }
        queued.push(entry)
      })

      setPending((rows) => [...rows, ...rejected, ...queued])
      queued.forEach((entry) => {
        void send(entry)
      })
    },
    [files, pending, send],
  )

  const retry = useCallback(
    (key: string) => {
      const entry = pending.find((row) => row.key === key)
      if (entry) void send({ ...entry, progress: 0 })
    },
    [pending, send],
  )

  const dismiss = useCallback((key: string) => {
    setPending((rows) => rows.filter((row) => row.key !== key))
  }, [])

  const remove = useCallback(async (fileId: string) => {
    const activeToken = tokenRef.current
    if (!activeToken) return
    const snapshot = files
    setFiles((rows) => rows.filter((row) => row.id !== fileId))
    try {
      await api(`/api/uploads/${fileId}`, { method: 'DELETE', token: activeToken })
    } catch (error) {
      // Put it back rather than silently losing the customer's upload.
      setFiles(snapshot)
      throw error
    }
  }, [files])

  const counts = useMemo<FileCounts>(() => {
    const totals: FileCounts = {}
    for (const file of files) totals[file.fieldId] = (totals[file.fieldId] ?? 0) + 1
    return totals
  }, [files])

  const uploading = pending.some((row) => row.status === 'uploading')

  return { files, setFiles, pending, addFiles, retry, dismiss, remove, counts, uploading }
}

export type UploadManager = ReturnType<typeof useUploads>
