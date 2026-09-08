import type { Answers } from '@shared/questionnaire'
import type { ProjectSummary } from '../components/ProjectSummaryView'

export interface ProjectRecord {
  id: string
  reference: string
  status: string
  contactName: string | null
  businessName: string | null
  email: string | null
  phone: string | null
  answers: Answers
  submittedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  summary: ProjectSummary | null
  summaryStatus: string
  summaryError: string | null
  summaryAttempts: number
  summaryUpdatedAt: string | null
  emailStatus: string
  emailError: string | null
  emailAttempts: number
  emailSentAt: string | null
  emailProvider: string | null
}

export interface FileMeta {
  id: string
  fieldId: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface Note {
  id: string
  body: string
  category: string
  author: string | null
  createdAt: string
  updatedAt: string | null
}

export interface ChecklistEntry {
  itemKey: string
  label: string
  position: number
  completed: boolean
  completedAt: string | null
  completedBy: string | null
}

export interface ProjectResponse {
  project: ProjectRecord
  files: FileMeta[]
  notes: Note[]
  checklist: ChecklistEntry[]
  viewer: string
}
