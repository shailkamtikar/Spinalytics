import { useCallback, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AnalyzeRequest, SampleCase } from '../api/client'
import { ErrorPanel } from '../components/feedback/Feedback'
import { Label } from '../components/ui'
import { CsvUpload } from '../features/input/csv/CsvUpload'
import { ManualForm } from '../features/input/manual/ManualForm'
import { useCatalog } from '../features/input/requestUtils'
import { ReviewPanel } from '../features/input/ReviewPanel'
import { SampleCasePicker } from '../features/input/SampleCasePicker'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAnalysisStore } from '../state/analysisStore'

type Tab = 'sample' | 'csv' | 'manual'
const TABS: { id: Tab; label: string }[] = [
  { id: 'sample', label: 'Sample case' },
  { id: 'csv', label: 'CSV upload' },
  { id: 'manual', label: 'Manual entry' },
]

interface Pending {
  request: AnalyzeRequest
  notes: string[]
  blockers: string[]
}

export default function Analyze() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  useDocumentTitle('Analyse')
  const navigate = useNavigate()
  const { catalog, error: catalogError, retry } = useCatalog()
  const run = useAnalysisStore((s) => s.run)
  const error = useAnalysisStore((s) => s.error)
  const status = useAnalysisStore((s) => s.status)
  const [tab, setTab] = useState<Tab>('sample')
  const [pending, setPending] = useState<Pending | null>(null)

  const onCsv = useCallback((request: AnalyzeRequest | null, notes: string[]) => setPending(request ? { request, notes, blockers: [] } : null), [])
  const onManual = useCallback((request: AnalyzeRequest, notes: string[], blockers: string[]) => setPending({ request, notes, blockers }), [])
  const onSample = useCallback((c: SampleCase) => setPending({ request: c.request, notes: c.incomplete_note ? [c.incomplete_note] : [], blockers: [] }), [])

  const switchTab = (t: Tab) => {
    setTab(t)
    setPending(null)
  }
  const submitted = useRef(false)
  const analyse = async () => {
    if (!pending || submitted.current) return // a second click before the page changes must not send again
    submitted.current = true
    if (await run(pending.request)) navigate('/results')
    else submitted.current = false
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-14 lg:px-10">
      <Label>Step 1 of 2 · Input</Label>
      <h1 className="mt-4 text-5xl">
        Bring in a <em className="text-accent">spine</em>.
      </h1>
      <p className="mt-4 max-w-prose text-muted">Choose how to provide measurements. Every route ends in the same review step before anything is analysed.</p>
      {notice && (
        <p role="status" className="mt-4 text-sm text-review">
          ◐ {notice}
        </p>
      )}

      <div role="tablist" aria-label="Input method" className="mt-10 flex gap-2 border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => switchTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 font-mono text-[0.78rem] uppercase tracking-[0.14em] ${tab === t.id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-8">
        {tab === 'sample' && <SampleCasePicker onPick={onSample} />}
        {tab !== 'sample' && catalogError && <ErrorPanel error={catalogError as never} onRetry={retry} />}
        {tab !== 'sample' && !catalog && !catalogError && <p role="status" className="font-mono text-sm text-muted">Loading the measurement catalog…</p>}
        {tab === 'csv' && catalog && <CsvUpload catalog={catalog} onChange={onCsv} />}
        {tab === 'manual' && catalog && <ManualForm catalog={catalog} onChange={onManual} />}
      </div>

      {catalog && pending && <ReviewPanel request={pending.request} catalog={catalog} notes={pending.notes} blockers={pending.blockers} onAnalyse={analyse} />}
      {!catalog && tab === 'sample' && pending && <p className="mt-6 font-mono text-sm text-muted">Preparing the review…</p>}
      {status === 'error' && error && (
        <div className="mt-6">
          <ErrorPanel error={error} onRetry={pending ? analyse : undefined} />
        </div>
      )}
    </div>
  )
}
