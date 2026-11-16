import { motion } from 'motion/react'
import type { AnalyzeRequest, Catalog } from '../../api/client'
import { EASE } from '../../components/fx'
import { useAnalysisStore } from '../../state/analysisStore'
import { ServerWaking } from '../../components/feedback/Feedback'
import { Button, Caption, Label, Panel } from '../../components/ui'
import { reviewWarnings, summarise } from './requestUtils'

interface Props {
  request: AnalyzeRequest
  catalog: Catalog
  /** Notes about what was mapped, ignored or treated as missing before this point. */
  notes?: string[]
  blockers?: string[]
  onAnalyse: () => void
}

/** The mandatory review step shared by all three input methods. */
export function ReviewPanel({ request, catalog, notes = [], blockers = [], onAnalyse }: Props) {
  const status = useAnalysisStore((s) => s.status)
  const s = summarise(request, catalog)
  const warnings = reviewWarnings(s)
  const busy = status === 'loading' || status === 'waking'
  return (
    <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}>
    <Panel aria-labelledby="review-title" className="mt-8">
      <Label>Review before analysing</Label>
      <h2 id="review-title" className="mt-2 text-2xl">
        Check what will be sent
      </h2>
      <div className="mt-4 h-1.5 w-full max-w-lg overflow-hidden rounded-full bg-rule" role="presentation">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.round(s.completeness * 100)}%` }} transition={{ duration: 0.9, ease: EASE }} />
      </div>
      <figure className="mt-4">
        <table className="w-full max-w-lg border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-rule font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
              <th scope="col" className="py-2 font-normal">Region</th>
              <th scope="col" className="py-2 text-right font-normal">Provided</th>
              <th scope="col" className="py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {(['cervical', 'thoracic', 'lumbar'] as const).map((r) => (
              <tr key={r} className="border-b border-rule">
                <th scope="row" className="py-2 font-sans font-normal capitalize">{r}</th>
                <td className="py-2 text-right">{s.byRegion[r].present}</td>
                <td className="py-2 text-right text-muted">{s.byRegion[r].total}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 font-sans font-medium">All spine measurements</th>
              <td className="py-2 text-right" data-testid="present-count">{s.present}</td>
              <td className="py-2 text-right text-muted">{s.expected}</td>
            </tr>
          </tbody>
        </table>
        <Caption label="TABLE 2">
          Completeness {Math.round(s.completeness * 100)}% · person details {s.personGiven} of {s.personTotal}
        </Caption>
      </figure>
      {[...blockers, ...warnings, ...notes].length > 0 && (
        <ul className="mt-5 space-y-2 text-sm" aria-label="Review notes">
          {blockers.map((w) => (
            <li key={w} className="text-large">▲ {w}</li>
          ))}
          {warnings.map((w) => (
            <li key={w} className="text-review">◐ {w}</li>
          ))}
          {notes.map((w) => (
            <li key={w} className="text-muted">○ {w}</li>
          ))}
        </ul>
      )}
      {status === 'waking' && <div className="mt-5"><ServerWaking /></div>}
      <div className="mt-6">
        <Button onClick={onAnalyse} disabled={busy || s.present === 0 || blockers.length > 0}>
          {busy ? 'Analysing…' : 'Analyse spine'}
        </Button>
      </div>
    </Panel>
    </motion.div>
  )
}
