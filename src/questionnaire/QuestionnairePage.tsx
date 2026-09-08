import { useEffect } from 'react'
import { TOTAL_STEPS } from '@shared/questionnaire'
import { AutosaveIndicator } from '../components/AutosaveIndicator'
import { Masthead } from '../components/Masthead'
import { Notice } from '../components/Notice'
import { SkeletonCard } from '../components/Skeleton'
import { IntroCard } from './IntroCard'
import { ReviewStep } from './ReviewStep'
import { SaveLater } from './SaveLater'
import { ThankYou } from './ThankYou'
import { WhatHappensNext } from './WhatHappensNext'
import { WizardProgress } from './WizardProgress'
import { WizardStep } from './WizardStep'
import { useQuestionnaire } from './useQuestionnaire'

export function QuestionnairePage() {
  const questionnaire = useQuestionnaire()
  const {
    phase,
    token,
    step,
    section,
    percent,
    sectionErrors,
    notice,
    startError,
    resumed,
    reference,
    saveState,
    savedAt,
    uploads,
    start,
    saveNow,
    next,
    back,
    startAnother,
    dismissResumed,
  } = questionnaire

  useEffect(() => {
    document.title =
      phase === 'done'
        ? 'Project Enquiry received — NexalField'
        : 'Website Project Enquiry — NexalField'
  }, [phase])

  const inWizard = phase === 'wizard' || phase === 'review'

  /*
   * The masthead, the page title and its lede together pushed the first
   * question 635px down an 844px phone — three quarters of the opening screen
   * spent on furniture the customer had already read, repeated on all seven
   * steps. Once the wizard starts, the progress panel ("Step 3 of 7 ·
   * Branding & Design") and the section card carry the context, so the title
   * stays only for screen readers.
   */
  const showTitleBlock = phase === 'loading' || phase === 'intro'

  return (
    <>
      <a className="skip-link" href="#questionnaire">
        Skip to the enquiry
      </a>
      <Masthead>
        {inWizard && token ? (
          <div className="masthead-meta">
            <AutosaveIndicator state={saveState} savedAt={savedAt} onRetry={() => void saveNow()} />
          </div>
        ) : null}
      </Masthead>

      <main className="shell" id="questionnaire">
        {showTitleBlock ? (
          <div className="page-intro stack-sm">
            <p className="eyebrow">NexalField</p>
            <h1>Website Project Enquiry</h1>
            <p className="lede">
              Provide as much detail as possible so we can create a website that accurately
              represents your business and goals.
            </p>
          </div>
        ) : inWizard ? (
          <h1 className="visually-hidden">Website Project Enquiry</h1>
        ) : null}

        {phase === 'loading' ? (
          <div className="stack-lg" style={{ paddingTop: 24 }}>
            <span className="visually-hidden" role="status">
              Loading your enquiry
            </span>
            <SkeletonCard rows={3} />
          </div>
        ) : null}

        {phase === 'intro' ? (
          <div style={{ paddingTop: 26 }}>
            <IntroCard notice={notice} error={startError} onStart={() => void start()} />
          </div>
        ) : null}

        {inWizard ? (
          <div className="wizard" style={{ paddingTop: 20 }}>
            <div className="wizard-main">
              <WizardProgress
                step={step}
                /*
                 * Optional questions a customer chose to skip should not leave
                 * them staring at "73% complete" on the screen where they
                 * submit. At review with nothing outstanding they are done, so
                 * the bar says so; if a required answer is missing the real
                 * figure is shown, which is exactly when it is informative.
                 */
                percent={phase === 'review' && sectionErrors.size === 0 ? 100 : percent}
                section={section}
                reviewing={phase === 'review'}
              />

              {resumed ? (
                <div style={{ margin: '18px 0' }}>
                  <Notice
                    tone="success"
                    title="Welcome back"
                    action={
                      <button type="button" className="btn btn-sm btn-ghost" onClick={dismissResumed}>
                        Dismiss
                      </button>
                    }
                  >
                    We have picked up exactly where you left off. Everything you entered before is
                    still here.
                  </Notice>
                </div>
              ) : null}

              {phase === 'wizard' && section ? (
                <div style={{ marginTop: 18 }}>
                  <WizardStep section={section} questionnaire={questionnaire} />
                </div>
              ) : null}

              {phase === 'review' ? (
                <div style={{ marginTop: 18 }}>
                  <ReviewStep questionnaire={questionnaire} />
                </div>
              ) : null}

              {phase === 'wizard' ? (
                <nav className="wizard-nav" aria-label="Project Enquiry navigation">
                  <div className="wizard-nav-inner">
                    <button
                      type="button"
                      className="btn btn-back"
                      onClick={back}
                      disabled={step === 1}
                    >
                      Back
                    </button>
                    {token ? (
                      <span className="nav-save">
                        <SaveLater token={token} onSave={saveNow} />
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={next}
                      disabled={uploads.uploading}
                    >
                      {step === TOTAL_STEPS ? 'Review answers' : 'Continue'}
                    </button>
                  </div>
                </nav>
              ) : null}
            </div>

            <aside className="wizard-aside">
              <WhatHappensNext />
              {token && phase === 'wizard' ? (
                <div className="card-quiet stack-sm save-panel">
                  <h3 style={{ fontSize: '1rem' }}>Need to stop?</h3>
                  <p className="small muted">
                    Your progress is saved on our server as you type. Save a continuation link if
                    you want to finish on another device.
                  </p>
                  <SaveLater token={token} onSave={saveNow} />
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        {phase === 'done' ? (
          <div style={{ paddingTop: 34 }}>
            <ThankYou reference={reference} token={token} onStartAnother={startAnother} />
          </div>
        ) : null}
      </main>

      <footer className="footer">
        <div className="shell spread">
          <span>© {new Date().getFullYear()} NexalField</span>
          <span>
            Questions? Email{' '}
            <a href="mailto:nexalfield@gmail.com">nexalfield@gmail.com</a>
          </span>
        </div>
      </footer>
    </>
  )
}
