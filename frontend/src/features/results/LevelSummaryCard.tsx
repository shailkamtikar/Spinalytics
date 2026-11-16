import type { Finding, ModelResult } from '../../api/client'
import { NumberCell, StatusBadge, type Status } from '../../components/ui'
import { describeLevel } from './describeLevel'

const TONE = { good: 'text-within', attention: 'text-large', unknown: 'text-missing' } as const
const GLYPH = { good: '●', attention: '▲', unknown: '○' } as const

interface Props {
  level: string
  status?: Status
  findings: Finding[]
  model?: ModelResult
  onClose: () => void
}

/** Shown over the figure the moment a level is clicked: what is typical here, and whether this level matches it. */
export function LevelSummaryCard({ level, status, findings, model, onClose }: Props) {
  const d = describeLevel(level, findings, model)
  return (
    <section
      aria-labelledby="level-summary-title"
      className="absolute inset-x-0 bottom-16 z-10 max-h-[60%] overflow-auto rounded-sm border border-rule bg-surface p-4"
      data-testid="level-summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="level-summary-title" className="text-2xl">{level}</h2>
          {status && d.measured && <StatusBadge status={status} />}
        </div>
        <button type="button" onClick={onClose} className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted hover:text-text">Close (Esc)</button>
      </div>

      <p className={`mt-2 text-sm font-medium ${TONE[d.tone]}`}>
        <span aria-hidden="true">{GLYPH[d.tone]} </span>
        <span className="text-text">{d.headline}</span>
      </p>

      {d.reasons.length > 0 && (
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {d.reasons.map((r) => (
            <li key={r} className="border-l border-rule pl-3">{r}</li>
          ))}
        </ul>
      )}
      {d.modelNote && <p className="mt-2 text-sm text-muted">{d.modelNote}</p>}

      {d.typicalRows.length > 0 && (
        <>
          <h3 className="mt-3 font-mono text-[0.68rem] font-normal uppercase tracking-[0.14em] text-muted">What a typical {level.includes('-') ? 'disc' : 'vertebra'} looks like here</h3>
          <table className="mt-1 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-rule font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                <th scope="col" className="py-1 font-normal">Measurement</th>
                <th scope="col" className="py-1 text-right font-normal">This spine</th>
                <th scope="col" className="py-1 text-right font-normal">Typical</th>
                <th scope="col" className="py-1 text-right font-normal">Typical range</th>
              </tr>
            </thead>
            <tbody>
              {d.typicalRows.map((r) => (
                <tr key={r.label} className="border-b border-rule">
                  <th scope="row" className="py-1 pr-2 font-normal">{r.label}</th>
                  <td className={`py-1 ${r.status === 'review' ? 'text-review' : r.status === 'large_deviation' ? 'text-large' : ''}`}><NumberCell value={r.value} unit={r.unit} /></td>
                  <td className="py-1"><NumberCell value={r.typical} unit={r.unit} /></td>
                  <td className="whitespace-nowrap py-1 text-right font-mono tabular-nums text-muted">{r.low !== null && r.high !== null ? `${r.low.toFixed(1)} to ${r.high.toFixed(1)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-3 text-[0.7rem] text-muted">{d.note}</p>
    </section>
  )
}
