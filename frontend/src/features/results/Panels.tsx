import type { Finding, ModelInfo, ModelResult, ReferenceInfo } from '../../api/client'
import { Label, NumberCell, Panel, StatusBadge, type Status } from '../../components/ui'
import { MODEL_LABEL, OVERALL_LABEL } from '../../domain/wording'
import { UNMEASURED } from '../../domain/levels'
import { featureLabel, type Result } from './selectors'

const STATE_WORD: Record<string, string> = { within_reference: 'within reference', unusual_pattern: 'unusual pattern', indeterminate: 'indeterminate' }
const TONE: Record<string, string> = { within: 'text-within', large: 'text-large', missing: 'text-missing', review: 'text-review' }

export function Summary({ result }: { result: Result }) {
  const o = OVERALL_LABEL[result.overall.state]
  const s = result.statistical
  const limit = s.chance_outlier_limit
  return (
    <Panel aria-labelledby="summary-title" className="mt-8">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Label>Overall</Label>
          <p id="summary-title" className={`mt-2 max-w-prose text-lg ${TONE[o.tone]}`}>
            <span aria-hidden="true">{o.glyph} </span>
            <span className="text-text">{result.overall.reason}</span>
          </p>
          <p className="mt-3 max-w-prose text-sm text-muted">Statistics: {STATE_WORD[result.overall.statistics_state]} · Model: {result.model.status === 'ok' ? MODEL_LABEL[result.model.label ?? 'indeterminate'] : 'did not give a score'}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm">
          <dt className="text-muted">Completeness</dt>
          <dd className="text-right tabular-nums">{Math.round(s.completeness * 100)}% ({s.n_present} of {s.n_expected})</dd>
          <dt className="text-muted">Larger deviation</dt>
          <dd className="text-right tabular-nums">{s.n_large}</dd>
          <dt className="text-muted">Review</dt>
          <dd className="text-right tabular-nums">{s.n_review}</dd>
          <dt className="text-muted">Outside central range</dt>
          <dd className="text-right tabular-nums">{s.outlier_count}{limit ? ` (up to ${limit} expected by chance)` : ''}</dd>
          <dt className="text-muted">Reference group</dt>
          <dd className="text-right">{s.cohort === 'all' ? 'both sexes' : s.cohort === 'sex_male_1' ? 'male' : 'female'}</dd>
        </dl>
      </div>
      {(s.warnings.length > 0 || s.unrecognised_columns.length > 0) && (
        <ul className="mt-5 space-y-1 border-t border-rule pt-4 text-sm" aria-label="Warnings">
          {s.warnings.map((w) => (
            <li key={`${w.code}-${w.field}`} className="text-review">◐ {w.message}</li>
          ))}
          {s.unrecognised_columns.map((u) => (
            <li key={u.column} className="text-muted">○ Not used: {u.column} ({u.reason})</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function ModelPanel({ model, onSelectLevel }: { model: ModelResult; onSelectLevel: (level: string) => void }) {
  return (
    <Panel aria-labelledby="model-title">
      <Label>Model view · separate from the comparison</Label>
      <h2 id="model-title" className="mt-1 text-2xl">Whole-pattern score</h2>
      {model.status === 'ok' && model.score !== null && model.score !== undefined && (
        <>
          <p className="mt-3 font-mono text-sm">
            Model score <span className="text-lg tabular-nums">{model.score.toFixed(2)}</span> · {MODEL_LABEL[model.label ?? 'indeterminate']}
          </p>
          <div className="relative mt-3 h-3 border border-rule" role="img" aria-label={`Model score ${model.score.toFixed(2)} on a scale from 0 to 1; the uncertain band is ${model.band_low} to ${model.band_high}`}>
            <div className="absolute inset-y-0 bg-review/30" style={{ left: `${(model.band_low ?? 0.4) * 100}%`, width: `${((model.band_high ?? 0.6) - (model.band_low ?? 0.4)) * 100}%` }} />
            <div className="absolute -inset-y-1 w-0.5 bg-text" style={{ left: `${model.score * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Not the probability of disease. It shows how much the overall pattern resembles the unusual training examples. Scores between {model.band_low} and {model.band_high} are treated as uncertain.</p>
          {(model.contributors ?? []).length > 0 && (
            <>
              <h3 className="mt-5 font-mono text-[0.72rem] font-normal uppercase tracking-[0.14em] text-muted">What moves the score most</h3>
              <ol className="mt-2 space-y-1 text-sm">
                {(model.contributors ?? []).map((c) => (
                  <li key={c.group} className="flex items-baseline justify-between gap-3 border-b border-rule py-1">
                    {c.level ? (
                      <button type="button" onClick={() => onSelectLevel(c.level!)} className="text-left underline-offset-4 hover:underline">{c.group}</button>
                    ) : (
                      <span>{c.group}</span>
                    )}
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
                      {c.change >= 0 ? '+' : ''}{c.change.toFixed(2)} · {c.change >= 0 ? 'toward unusual' : 'toward reference'}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted">Each value is how much the score changes when that group of measurements is replaced by a typical value.</p>
            </>
          )}
        </>
      )}
      {model.status === 'insufficient_data' && <p className="mt-3">Model did not run: {model.missing_count} measurement{model.missing_count === 1 ? ' is' : 's are'} missing. The model needs every spine measurement and never fills in values. The statistical comparison is unaffected.</p>}
      {model.status === 'out_of_distribution' && <p className="mt-3">{model.message} The statistical comparison is unaffected.</p>}
      {model.status === 'unavailable' && <p className="mt-3 text-muted">The model is not available right now. The statistical comparison below is complete without it.</p>}
    </Panel>
  )
}

export function DetailsPanel({ level, findings, onClear }: { level: string | null; findings: Finding[]; onClear: () => void }) {
  if (!level) {
    return (
      <Panel aria-labelledby="details-title">
        <Label>Selected level</Label>
        <h2 id="details-title" className="mt-1 text-2xl">Nothing selected</h2>
        <p className="mt-2 text-sm text-muted">Click a vertebra or disc in the figure, a level in the list, or a row in the table.</p>
      </Panel>
    )
  }
  const unmeasured = UNMEASURED.includes(level)
  const rows = findings.filter((f) => f.level === level)
  return (
    <Panel aria-labelledby="details-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label>Selected level</Label>
          <h2 id="details-title" className="mt-1 text-2xl">{level}</h2>
        </div>
        <button type="button" onClick={onClear} className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted hover:text-text">Clear (Esc)</button>
      </div>
      {unmeasured ? (
        <p className="mt-3 text-sm">{level} is not measured in this version. Its vertebral body has no comparable measurements in the data, so it is drawn as an outline and never given a status.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No comparisons exist for this level.</p>
      ) : (
        <table className="mt-3 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-rule font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="py-1.5 font-normal">Measurement</th>
              <th scope="col" className="py-1.5 text-right font-normal">Value</th>
              <th scope="col" className="py-1.5 text-right font-normal">Mean</th>
              <th scope="col" className="py-1.5 text-right font-normal">z</th>
              <th scope="col" className="py-1.5 font-normal"><span className="sr-only">Status</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.column} className="border-b border-rule">
                <th scope="row" className="py-1.5 pr-2 font-normal">{featureLabel(f)}</th>
                <td className="py-1.5"><NumberCell value={f.value} unit={f.unit === 'ratio' ? '' : f.unit} /></td>
                <td className="py-1.5"><NumberCell value={f.reference?.mean} unit={f.unit === 'ratio' ? '' : f.unit} /></td>
                <td className="py-1.5"><NumberCell value={f.z_score} signed /></td>
                <td className="py-1.5 pl-2"><StatusBadge status={f.status as Status} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

export function ProvenancePanel({ reference, model, result }: { reference: ReferenceInfo | null; model: ModelInfo | null; result: Result }) {
  return (
    <Panel aria-labelledby="prov-title">
      <Label>Where the numbers come from</Label>
      <h2 id="prov-title" className="mt-1 text-2xl">Reference and model</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm md:grid-cols-[12rem_1fr]">
        <dt className="text-muted">Data origin</dt>
        <dd>Synthetic (generated, not collected from people)</dd>
        <dt className="text-muted">Reference</dt>
        <dd>{result.statistical.provenance.limitation as string}</dd>
        <dt className="text-muted">Reference group size</dt>
        <dd className="font-mono tabular-nums">{reference ? reference.cohorts[result.statistical.cohort]?.n_rows.toLocaleString() : '…'} rows</dd>
        <dt className="text-muted">Status thresholds</dt>
        <dd>{result.statistical.thresholds.note}</dd>
        <dt className="text-muted">Model</dt>
        <dd>{model ? `${model.selected_model.replace(/_/g, ' ')} · application version ${model.version}` : '…'}</dd>
        <dt className="text-muted">Analysis id</dt>
        <dd className="font-mono text-xs">{result.analysis_id} (random; results are not stored)</dd>
      </dl>
      <p className="mt-4 text-xs text-muted">{result.disclaimer}</p>
    </Panel>
  )
}
