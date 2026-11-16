import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { SpineSchematic } from '../components/spine/SpineSchematic'
import { Button, Caption, Label, NumberCell, StatusBadge, SyntheticBadge, type Status } from '../components/ui'
import { OVERALL_LABEL, MODEL_LABEL } from '../domain/wording'
import { featureLabel, levelOrder, statusMap, useInfo } from '../features/results/selectors'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAnalysisStore } from '../state/analysisStore'
import '../styles/print.css'

const LIMITATIONS = [
  'The reference and the model were built from synthetic (generated) data with invented effect sizes. They say nothing about real people.',
  'Status uses demonstration thresholds on the z-score (within reference up to 2, review 2 to 3.5, larger deviation above 3.5). They are not clinical cut-offs.',
  'About 270 comparisons are made, so a few land outside the central range by chance. The overall statement uses limits calibrated on validation data.',
  'The model score is not the probability of disease. The model gives no score when measurements are missing or lie far outside what it learned from.',
  'C1 and C2 are not measured. The 3D view and this map are schematic, with illustrative sizes.',
]

/** Printable report. Everything comes from the current in-memory result; nothing is sent anywhere. */
export default function Report() {
  useDocumentTitle('Report')
  const result = useAnalysisStore((s) => s.result)
  const messages = useAnalysisStore((s) => s.messages)
  const { reference, model } = useInfo()
  const [includeAi, setIncludeAi] = useState(false)
  const statuses = useMemo(() => (result ? statusMap(result) : {}), [result])
  if (!result) return <Navigate to="/analyze" replace state={{ notice: 'There is no result to put in a report yet.' }} />

  const s = result.statistical
  const overall = OVERALL_LABEL[result.overall.state]
  const findings = [...s.findings].sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.column.localeCompare(b.column))
  const flagged = s.flagged_levels
  const missing = s.findings.filter((f) => f.status === 'missing').length
  const aiAnswers = messages.filter((m) => m.role === 'assistant' && m.aiGenerated)
  const metrics = (model?.metrics ?? {}) as { test?: { full?: { roc_auc?: number; roc_auc_ci95?: number[] } }; validation_selected?: { full?: { roc_auc?: number } }; split_sizes?: Record<string, number> }
  const m = result.model

  return (
    <article className="mx-auto max-w-[1000px] px-6 py-10 lg:px-10">
      <div className="no-print mb-8 flex flex-wrap items-center gap-4">
        <Link to="/results" className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-accent hover:underline">← Back to results</Link>
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
        {aiAnswers.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeAi} onChange={(e) => setIncludeAi(e.target.checked)} className="accent-[var(--accent)]" />
            Include the AI assistant answers
          </label>
        )}
      </div>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <Label>Spinalytics analysis report</Label>
          <SyntheticBadge />
        </div>
        <h1 className="mt-3 text-4xl">{overall.title}</h1>
        <dl className="mt-4 grid gap-x-8 gap-y-1 font-mono text-sm md:grid-cols-[11rem_1fr]">
          <dt className="text-muted">Analysis id</dt>
          <dd>{result.analysis_id}</dd>
          <dt className="text-muted">Data origin</dt>
          <dd>Synthetic (generated, not collected from people)</dd>
          <dt className="text-muted">Completeness</dt>
          <dd>{Math.round(s.completeness * 100)}% ({s.n_present} of {s.n_expected} spine measurements)</dd>
          <dt className="text-muted">Reference group</dt>
          <dd>{s.cohort === 'all' ? 'both sexes' : s.cohort === 'sex_male_1' ? 'male' : 'female'} · {reference ? `${reference.cohorts[s.cohort]?.n_rows.toLocaleString()} reference rows` : 'synthetic reference'}</dd>
        </dl>
      </header>

      <section className="report-section" aria-labelledby="r-overall">
        <h2 id="r-overall" className="text-2xl">Overall result</h2>
        <p className="mt-2">{result.overall.reason}</p>
        <p className="mt-2 text-sm text-muted">
          Statistics: {s.overall_state.replace('_', ' ')} · {s.n_large} larger deviation, {s.n_review} review, {s.outlier_count} outside the central range{s.chance_outlier_limit ? ` (up to ${s.chance_outlier_limit} expected by chance)` : ''}. Model: {m.status === 'ok' ? `${MODEL_LABEL[m.label ?? 'indeterminate']}, score ${m.score?.toFixed(2)} (not the probability of disease)` : m.status === 'insufficient_data' ? `did not run, ${m.missing_count} measurements missing` : 'no score'}.
        </p>
        {(s.warnings.length > 0 || s.unrecognised_columns.length > 0 || missing > 0) && (
          <ul className="mt-3 space-y-1 text-sm">
            {missing > 0 && <li>○ {missing} comparisons have no value (missing); nothing was filled in.</li>}
            {s.warnings.map((w) => <li key={`${w.code}-${w.field}`}>◐ {w.message}</li>)}
            {s.unrecognised_columns.map((u) => <li key={u.column}>○ Not used: {u.column} ({u.reason})</li>)}
          </ul>
        )}
      </section>

      <section className="report-section" aria-labelledby="r-levels">
        <h2 id="r-levels" className="text-2xl">Affected levels</h2>
        {flagged.length === 0 ? (
          <p className="mt-2 text-muted">No level is marked review or larger deviation.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {flagged.map((l) => (
              <li key={l.level}><span className="font-mono">{l.level}</span> <StatusBadge status={l.status as Status} /></li>
            ))}
          </ul>
        )}
        <figure className="mt-4 flex items-start gap-8">
          <div className="w-40 shrink-0">
            <SpineSchematic statuses={statuses} className="h-auto w-full" />
          </div>
          <figcaption className="text-sm text-muted">
            <span className="font-mono text-text">FIG. 1</span> Level map, C1 to L5. Colour, glyph and word show each level's status; dashed outlines (C1, C2) are not measured. Sizes are illustrative.
          </figcaption>
        </figure>
      </section>

      <section className="report-section report-page-break" aria-labelledby="r-table">
        <h2 id="r-table" className="text-2xl">All comparisons</h2>
        <figure className="mt-3">
          <table className="report-table w-full border-collapse text-left text-[0.78rem]">
            <thead>
              <tr className="border-b border-rule font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted">
                <th scope="col" className="py-1 pr-2 font-normal">Level</th>
                <th scope="col" className="py-1 pr-2 font-normal">Measurement</th>
                <th scope="col" className="py-1 text-right font-normal">Value</th>
                <th scope="col" className="py-1 text-right font-normal">Ref. mean</th>
                <th scope="col" className="py-1 text-right font-normal">95% interval</th>
                <th scope="col" className="py-1 text-right font-normal">Diff.</th>
                <th scope="col" className="py-1 text-right font-normal">Diff. %</th>
                <th scope="col" className="py-1 text-right font-normal">z</th>
                <th scope="col" className="py-1 text-right font-normal">Pctl</th>
                <th scope="col" className="py-1 pl-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => {
                const u = f.unit === 'ratio' ? '' : f.unit
                return (
                  <tr key={f.column} className="border-b border-rule align-top">
                    <th scope="row" className="py-1 pr-2 font-mono font-normal">{f.level}</th>
                    <td className="py-1 pr-2">{featureLabel(f)}</td>
                    <td className="py-1"><NumberCell value={f.value} unit={u} /></td>
                    <td className="py-1"><NumberCell value={f.reference?.mean} unit={u} /></td>
                    <td className="py-1 text-right font-mono tabular-nums">{f.reference ? `${f.reference.interval_low.toFixed(2)} to ${f.reference.interval_high.toFixed(2)}` : '—'}</td>
                    <td className="py-1"><NumberCell value={f.delta} unit={u} signed /></td>
                    <td className="py-1"><NumberCell value={f.pct_difference} unit="%" digits={1} signed /></td>
                    <td className="py-1"><NumberCell value={f.z_score} signed /></td>
                    <td className="py-1"><NumberCell value={f.percentile} digits={1} /></td>
                    <td className="whitespace-nowrap py-1 pl-2"><StatusBadge status={f.status as Status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Caption label="TABLE 1">Every comparison in this analysis. Percentage difference is shown for lengths only. Reference interval is the central 95% of the synthetic reference group.</Caption>
        </figure>
      </section>

      <section className="report-section" aria-labelledby="r-model">
        <h2 id="r-model" className="text-2xl">Reference, model and evaluation</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm md:grid-cols-[11rem_1fr]">
          <dt className="text-muted">Reference</dt>
          <dd>{s.provenance.limitation as string}</dd>
          <dt className="text-muted">Thresholds</dt>
          <dd>{s.thresholds.note}</dd>
          <dt className="text-muted">Model</dt>
          <dd>{model ? `${model.selected_model.replace(/_/g, ' ')}, application version ${model.version}` : 'selected on validation data'}</dd>
          <dt className="text-muted">Evaluation</dt>
          <dd>
            {metrics.test?.full?.roc_auc !== undefined
              ? `On held-out synthetic test data the ROC-AUC is ${metrics.test.full.roc_auc.toFixed(3)}${metrics.test.full.roc_auc_ci95 ? ` (95% interval ${metrics.test.full.roc_auc_ci95.map((v) => v.toFixed(3)).join(' to ')})` : ''}. This measures separation of generated patterns, not clinical accuracy.`
              : 'Evaluated on held-out synthetic data; see the model card.'}
          </dd>
        </dl>
      </section>

      {includeAi && aiAnswers.length > 0 && (
        <section className="report-section" aria-labelledby="r-ai">
          <h2 id="r-ai" className="text-2xl">AI assistant answers</h2>
          <p className="mt-1 text-sm text-muted">AI-generated educational explanations. They are not verified medical conclusions. Sources: none supplied, so none are cited.</p>
          <ul className="mt-3 space-y-4">
            {messages.map((msg, i) => (
              <li key={i}>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted">{msg.role === 'user' ? 'Question' : 'AI-generated educational explanation'}</p>
                <p className="whitespace-pre-line text-sm">{msg.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-section" aria-labelledby="r-limits">
        <h2 id="r-limits" className="text-2xl">Limitations and uncertainty</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p className="mt-4 rounded-sm border border-rule p-3 text-sm" role="note">
          <strong className="font-medium">Non-diagnostic statement.</strong> {result.disclaimer} This report uses synthetic data and must not be used for any decision about care.
        </p>
      </section>
    </article>
  )
}
