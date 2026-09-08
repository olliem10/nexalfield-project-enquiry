import { useMemo, useState } from 'react'
import { isFieldAnswered, visibleFields, type Section } from '@shared/questionnaire'
import { QuestionCard } from '../components/QuestionCard'
import type { Questionnaire } from './useQuestionnaire'

interface WizardStepProps {
  section: Section
  questionnaire: Questionnaire
}

export function WizardStep({ section, questionnaire }: WizardStepProps) {
  const { answers, setAnswer, errors, uploads } = questionnaire
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)

  const fields = useMemo(() => visibleFields(section, answers), [section, answers])
  const firstIncomplete = fields.findIndex((field) => !isFieldAnswered(field, answers, uploads.counts))

  return (
    <div>
      <div className="section-intro">
        <p className="eyebrow">{section.eyebrow}</p>
        <h2>{section.title}</h2>
        <p className="lede">{section.intro}</p>
      </div>

      <div className="questions">
        {fields.map((field, index) => {
          const answered = isFieldAnswered(field, answers, uploads.counts)
          const active = activeFieldId === field.id
          return (
            <QuestionCard
              key={field.id}
              field={field}
              value={answers[field.id]}
              answered={answered}
              active={active}
              upcoming={firstIncomplete >= 0 && index > firstIncomplete}
              error={errors[field.id]}
              uploads={uploads}
              onChange={(value) => setAnswer(field.id, value)}
              onActivate={() => setActiveFieldId(field.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
