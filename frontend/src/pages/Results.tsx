import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getHealth, type Finding } from '../api/client'
import { AskPanel } from '../features/assistant/AskPanel'
import { Button, Caption, Label, Rule } from '../components/ui'
import { DeviationChart, ReferenceChart } from '../features/results/Charts'
import { FindingsTable } from '../features/results/FindingsTable'
import { LevelList } from '../features/results/LevelList'
import { DetailsPanel, ModelPanel, ProvenancePanel, Summary } from '../features/results/Panels'
import { statusMap, strongestFinding, useInfo } from '../features/results/selectors'
import { SpineFigure } from '../features/spine3d/SpineFigure'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { OVERALL_LABEL } from '../domain/wording'
import { useAnalysisStore } from '../state/analysisStore'

export default function Results() {
  useDocumentTitle('Results')
  const result = useAnalysisStore((s) => s.result)
  const selected = useAnalysisStore((s) => s.selectedLevel)
  const selectLevel = useAnalysisStore((s) => s.selectLevel)
  const { reference, model } = useInfo()
  const heading = useRef<HTMLHeadingElement>(null)
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

  useEffect(() => heading.current?.focus(), [result])
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
  const pick = (f: Finding) => {
    setFocusColumn(f.column)
    selectLevel(f.level)
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-14 lg:px-10">
      <Label>Step 2 of 2 · Result</Label>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-[clamp(2.2rem,5vw,3.8rem)] outline-none">
        {overall.title}
      </h1>
      <Summary result={result} />

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <figure className="lg:sticky lg:top-20 lg:self-start">
          <div className="h-[30rem] lg:h-[34rem]">
            <SpineFigure reference={reference} statuses={statuses} selected={selected} onSelect={selectLevel} controls />
          </div>
          <Caption label="FIG. 1">Schematic spine. Sizes from the synthetic reference; not anatomically exact. Colour and glyph show each level's status. C1 and C2 are outlines, not measured.</Caption>
          <div className="mt-4">
            <LevelList statuses={statuses} selected={selected} onSelect={selectLevel} />
          </div>
        </figure>
        <div className="space-y-6">
          <ModelPanel model={result.model} onSelectLevel={selectLevel} />
          <div>
            {aiConfigured === false && <p className="text-sm text-muted">The optional AI assistant is not set up on this server. Everything else on this page works without it.</p>}
            {aiConfigured && !askOpen && (
              <Button ref={askButton} variant="secondary" onClick={() => setAskOpen(true)}>
                Ask AI About This Result
              </Button>
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
          <DetailsPanel level={selected} findings={findings} onClear={() => selectLevel(null)} />
          <div>
            <Rule number="A" title="Deviation by level" />
            <div className="mt-4">
              <DeviationChart findings={findings} selectedLevel={selected} onSelectLevel={(l) => selectLevel(l)} within={result.statistical.thresholds.within_max_abs_z} large={result.statistical.thresholds.large_min_abs_z} />
            </div>
          </div>
          <div>
            <Rule number="B" title="One value against its reference" />
            <div className="mt-4">
              <ReferenceChart finding={focused} />
            </div>
          </div>
        </div>
      </div>

      <section className="mt-14" aria-labelledby="table-title">
        <Rule number="C" title="All comparisons" />
        <h2 id="table-title" className="mb-5 mt-3 text-3xl">Findings table</h2>
        <FindingsTable findings={findings} selectedLevel={selected} focusColumn={focusColumn} onSelect={pick} />
      </section>

      <div className="mt-14">
        <ProvenancePanel reference={reference} model={model} result={result} />
      </div>
    </div>
  )
}
