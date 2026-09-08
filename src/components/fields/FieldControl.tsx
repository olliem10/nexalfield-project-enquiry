import {
  asMulti,
  type AddressValue,
  type AnswerValue,
  type ColourValue,
  type Field,
  type HoursValue,
  type MultiValue,
  type SocialValue,
} from '@shared/questionnaire'
import type { UploadManager } from '../../questionnaire/uploads'
import { AddressControl } from './AddressControl'
import { AgreementControl } from './AgreementControl'
import { ColoursControl } from './ColoursControl'
import { FileUploadControl } from './FileUploadControl'
import { HoursControl } from './HoursControl'
import { MultiSelectControl } from './MultiSelectControl'
import { RadioControl } from './RadioControl'
import { SocialControl } from './SocialControl'
import { TextControl } from './TextControl'

/** Field types whose control owns a real <label for> target. */
export const LABELLED_TYPES = ['text', 'email', 'tel', 'url', 'textarea', 'select', 'agreement']

interface FieldControlProps {
  field: Field
  value: AnswerValue
  invalid: boolean
  describedBy?: string
  uploads: UploadManager
  onChange: (value: AnswerValue) => void
}

export function FieldControl({
  field,
  value,
  invalid,
  describedBy,
  uploads,
  onChange,
}: FieldControlProps) {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'textarea':
    case 'select':
      return (
        <TextControl
          field={field}
          value={typeof value === 'string' ? value : ''}
          invalid={invalid}
          describedBy={describedBy}
          onChange={onChange}
        />
      )
    case 'radio':
      return (
        <RadioControl
          field={field}
          value={typeof value === 'string' ? value : ''}
          invalid={invalid}
          describedBy={describedBy}
          onChange={onChange}
        />
      )
    case 'multiselect':
      return (
        <MultiSelectControl
          field={field}
          value={asMulti(value)}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(next: MultiValue) => onChange(next)}
        />
      )
    case 'address':
      return (
        <AddressControl
          field={field}
          value={(value ?? {}) as AddressValue}
          describedBy={describedBy}
          onChange={(next) => onChange(next)}
        />
      )
    case 'colours':
      return (
        <ColoursControl
          field={field}
          value={Array.isArray(value) ? (value as ColourValue[]) : []}
          describedBy={describedBy}
          onChange={(next) => onChange(next)}
        />
      )
    case 'hours':
      return (
        <HoursControl
          field={field}
          value={(value ?? {}) as HoursValue}
          describedBy={describedBy}
          onChange={(next) => onChange(next)}
        />
      )
    case 'social':
      return (
        <SocialControl
          field={field}
          value={Array.isArray(value) ? (value as SocialValue[]) : []}
          describedBy={describedBy}
          onChange={(next) => onChange(next)}
        />
      )
    case 'files':
      return <FileUploadControl field={field} uploads={uploads} describedBy={describedBy} />
    case 'agreement':
      return (
        <AgreementControl
          field={field}
          value={value === true}
          invalid={invalid}
          describedBy={describedBy}
          onChange={(next) => onChange(next)}
        />
      )
    default:
      return null
  }
}
