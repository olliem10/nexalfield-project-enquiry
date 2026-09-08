import { CollapsiblePanel } from '../components/CollapsiblePanel'

const STEPS = [
  {
    title: 'We review your enquiry',
    body: 'Ollie reads through everything you have sent, usually within 1–2 business days.',
  },
  {
    title: 'We plan your website',
    body: 'Pages, structure and content are mapped out around your goals.',
  },
  {
    title: 'We contact you if we need clarification',
    body: 'If anything is unclear we will email you before any work starts.',
  },
  {
    title: 'We create the first version',
    body: 'Built with your branding, content and the pages you have asked for.',
  },
  {
    title: 'We make agreed revisions',
    body: 'You review the site and we refine the details until you are happy.',
  },
  {
    title: 'We launch your website',
    body: 'We publish it and send you everything you need to get going.',
  },
]

/** Collapsed on small screens so it never crowds the questions. */
export function WhatHappensNext() {
  return (
    <CollapsiblePanel title="What Happens Next?">
      <ol className="steps-list">
        {STEPS.map((step) => (
          <li key={step.title}>
            <span>
              <strong>{step.title}</strong>
              {step.body}
            </span>
          </li>
        ))}
      </ol>
    </CollapsiblePanel>
  )
}
