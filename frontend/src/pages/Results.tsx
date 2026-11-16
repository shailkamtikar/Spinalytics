import { motion } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getHealth, type Finding } from '../api/client'
import { EASE, Magnet } from '../components/fx'
import { Button, ButtonLink, Label, Rule } from '../components/ui'
import { OVERALL_LABEL } from '../domain/wording'
import { AskPanel } from '../features/assistant/AskPanel'
import { FindingsTable } from '../features/results/FindingsTable'
import { LevelPanel } from '../features/results/LevelPanel'
import { ModelPanel, ProvenancePanel, Summary } from '../features/results/Panels'
import { statusMap, strongestFinding, useInfo } from '../features/results/selectors'
import { SpineFigure } from '../features/spine3d/SpineFigure'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Reveal } from '../motion/Reveal'
import { useAnalysisStore } from '../state/analysisStore'

// Recharts is only needed on this page, so it loads as its own chunk after the first paint.
const DeviationChart = lazy(() => import('../features/results/Charts').then((m) => ({ default: m.DeviationChart })))
const ReferenceChart = lazy(() => import('../features/results/Charts').then((m) => ({ default: m.ReferenceChart })))
const chartFallback = <p role="status" className="font-mono text-sm text-muted">Loading chart…</p>

export default function Results() {
  useDocumentTitle('Results')
  const result = useAnalysisStore((s) => s.result)
  const selected = useAnalysisStore((s) => s.selectedLevel)
  const selectLevel = useAnalysisStore((s) => s.selectLevel)
  const { reference, model } = useInfo()
  const heading = useRef<HTMLHeadingElement>(null)
  const stage = useRef<HTMLElement>(null)
  const [focusColumn, setFocusColumn] = useState<string | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const askButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let alive = true
    getHealth().then((h) => alive && setAiConfigured(h.ai_assistant_configured), () => alive && setAiConfigured(false))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => heading.current?.focus({ preventScroll: true }), [result])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectLevel(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectLevel])

  const statuses = useMemo(() => (result ? statusMap(result) : {}), [result])
  const strongest = useMemo(() => (result ? strongestFinding(result.statistical.findings) : undefined), [result])

  if (!result) return <Navigate to="/analyze" replace state={{ notice: 'There is no result yet. Choose an input and run an analysis first.' }} />
  const findings = result.statistical.findings
  const overall = OVERALL_LABEL[result.overall.state]
  const focused: Finding | undefined = findings.find((f) => f.column === focusColumn) ?? (selected ? findings.filter((f) => f.level === selected && f.z_score !== null).sort((a, b) => Math.abs(b.z_score ?? 0) - Math.abs(a.z_score ?? 0))[0] : undefined) ?? strongest
  const flagged = [...result.statistical.flagged_levels].sort((a, b) => (b.worst_abs_z ?? 0) - (a.worst_abs_z ?? 0)).map((l) => ({ level: l.level, status: l.status }))

  /** A pick made far from the figure (table row, chart bar, model contributor) brings the figure into view first. */
  const bringStageIntoView = () => stage.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  const pickFromElsewhere = (level: string) => {
    selectLevel(level)
    bringStageIntoView()
  }
  const pick = (f: Finding) => {
    setFocusColumn(f.column)
    pickFromElsewhere(f.level)
  }

  return (
    <div className="mx-auto max-w-[1360px] px-6 py-14 lg:px-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <Label>Step 2 of 2 · Result</Label>
        <h1 ref={heading} tabIndex={-1} className="mt-4 text-[clamp(2.2rem,5vw,3.8rem)] outline-none">
          {overall.title}
        </h1>
      </motion.div>
      <Summary result={result} />
      <div className="mt-4 flex flex-wrap gap-3">
        <Magnet>
          <ButtonLink to="/report" variant="secondary">Export report</ButtonLink>
        </Magnet>
        <a href="#table-title" className="link-draw inline-flex items-center px-2 py-2.5 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-muted hover:text-text">Jump to all comparisons ↓</a>
      </div>

      <section ref={stage} aria-label="Interactive spine" className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-5 lg:h-[min(88vh,54rem)] lg:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.95fr)]">
        <figure className="relative flex h-[28rem] flex-col overflow-hidden rounded-sm border border-rule bg-surface/50 lg:h-auto">
          <div className="min-h-0 flex-1">
          <SpineFigure reference={reference} statuses={statuses} selected={selected} onSelect={selectLevel} controls />
          </div>
          <figcaption className="border-t border-rule bg-surface px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted">
            <span className="text-text">FIG. 1</span> Schematic spine, illustrative sizes. C1 and C2 are outlines. Click to zoom, drag to orbit, scroll to zoom.
          </figcaption>
        </figure>
        <aside aria-label="Selected part" className="relative min-h-[22rem] overflow-hidden rounded-sm border border-rule bg-surface p-5">
          <LevelPanel selected={selected} statuses={statuses} findings={findings} model={result.model} flagged={flagged} onSelect={selectLevel} />
        </aside>
      </section>

      <Reveal className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ModelPanel model={result.model} onSelectLevel={pickFromElsewhere} />
          <div>
            {aiConfigured === false && <p className="text-sm text-muted">The optional AI assistant is not set up on this server. Everything else on this page works without it.</p>}
            {aiConfigured && !askOpen && (
              <Magnet>
                <Button ref={askButton} variant="secondary" onClick={() => setAskOpen(true)}>
                  Ask AI About This Result
                </Button>
              </Magnet>
            )}
            {aiConfigured && askOpen && (
              <AskPanel
                result={result}
                onClose={() => {
                  setAskOpen(false)
                  requestAnimationFrame(() => askButton.current?.focus())
                }}
              />
            )}
          </div>
        </div>
        <div className="space-y-8">
          <div>
            <Rule number="A" title="Deviation by level" />
            <div className="mt-4">
              <Suspense fallback={chartFallback}>
                <DeviationChart findings={findings} selectedLevel={selected} onSelectLevel={pickFromElsewhere} within={result.statistical.thresholds.within_max_abs_z} large={result.statistical.thresholds.large_min_abs_z} />
              </Suspense>
            </div>
          </div>
          <div>
            <Rule number="B" title="One value against its reference" />
            <div className="mt-4">
              <Suspense fallback={chartFallback}>
                <ReferenceChart finding={focused} />
              </Suspense>
            </div>
          </div>
        </div>
      </Reveal>

      <section className="mt-16" aria-labelledby="table-title">
        <Reveal>
          <Rule number="C" title="All comparisons" />
          <h2 id="table-title" className="mb-5 mt-3 text-3xl">Findings table</h2>
          <FindingsTable findings={findings} selectedLevel={selected} focusColumn={focusColumn} onSelect={pick} />
        </Reveal>
      </section>

      <Reveal className="mt-14">
        <ProvenancePanel reference={reference} model={model} result={result} />
      </Reveal>
    </div>
  )
}
