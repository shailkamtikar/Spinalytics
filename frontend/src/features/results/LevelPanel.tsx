import { motion } from 'motion/react'
import type { Finding, ModelResult } from '../../api/client'
import { EASE } from '../../components/fx'
import { Label, NumberCell, StatusBadge, type Status } from '../../components/ui'
import { useReducedMotionSafe } from '../../motion/useReducedMotionSafe'
import { Legend } from '../spine3d/SpineFigure'
import { describeLevel } from './describeLevel'
import { LevelList } from './LevelList'
import { ALL_LEVELS_FOR_LIST } from './selectors'

const TONE = { good: 'text-within', attention: 'text-large', unknown: 'text-missing' } as const
const GLYPH = { good: '●', attention: '▲', unknown: '○' } as const

interface Props {
  selected: string | null
  statuses: Record<string, Status>
  findings: Finding[]
  model?: ModelResult
  flagged: { level: string; status: string }[]
  onSelect: (level: string | null) => void
}

/** The panel beside the 3D spine: an overview until a part is clicked, then everything about that part. */
function PanelBody({ selected, statuses, findings, model, flagged, onSelect }: Props) {
  const reduced = useReducedMotionSafe()
  const enter = reduced ? {} : { initial: { opacity: 0, x: 36 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.5, ease: EASE } }

  if (!selected) {
    return (
      <motion.div key="overview" data-testid="level-overview" className="shrink-0" {...enter}>
        <Label>Explore the spine</Label>
        <h2 className="mt-1 text-2xl">Pick a part</h2>
        <p className="mt-2 text-sm text-muted">Click any vertebra or disc in the figure. The camera flies to it and this panel says what is typical there and whether this spine matches.</p>
        {flagged.length > 0 && (
          <div className="mt-4">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">Start with what stands out</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {flagged.slice(0, 8).map((f, i) => (
                <motion.li key={f.level} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.05, duration: 0.4, ease: EASE }}>
                  <button type="button" onClick={() => onSelect(f.level)} className="press flex items-center gap-2 rounded-sm border border-rule px-2.5 py-1 font-mono text-sm hover:border-accent">
                    {f.level} <StatusBadge status={f.status as Status} compact />
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3"><Legend /></div>
      </motion.div>
    )
  }

  const d = describeLevel(selected, findings, model)
  const i = ALL_LEVELS_FOR_LIST.indexOf(selected)
  const prev = ALL_LEVELS_FOR_LIST[i - 1]
  const next = ALL_LEVELS_FOR_LIST[i + 1]
  const status = statuses[selected]

  return (
    <motion.div key={selected} data-testid="level-summary" className="flex min-h-0 flex-1 flex-col" {...enter} aria-labelledby="level-summary-title" role="region">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Selected part</Label>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h2 id="level-summary-title" className="text-4xl">{selected}</h2>
            {status && d.measured && <StatusBadge status={status} />}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={prev ? `Previous part, ${prev}` : 'No previous part'} disabled={!prev} onClick={() => prev && onSelect(prev)} className="press grid h-9 w-9 place-items-center rounded-sm border border-rule font-mono hover:border-accent disabled:opacity-30">↑</button>
          <button type="button" aria-label={next ? `Next part, ${next}` : 'No next part'} disabled={!next} onClick={() => next && onSelect(next)} className="press grid h-9 w-9 place-items-center rounded-sm border border-rule font-mono hover:border-accent disabled:opacity-30">↓</button>
          <button type="button" onClick={() => onSelect(null)} className="press ml-1 rounded-sm border border-rule px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted hover:border-accent hover:text-text">Close (Esc)</button>
        </div>
      </div>

      <div className="scroll-fade-y mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <motion.p initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45, ease: EASE }} className={`text-base font-medium ${TONE[d.tone]}`}>
          <span aria-hidden="true">{GLYPH[d.tone]} </span>
          <span className="text-text">{d.headline}</span>
        </motion.p>

        {d.typicalRows.length > 0 && (
          <>
            <h3 className="mt-5 font-mono text-[0.68rem] font-normal uppercase tracking-[0.14em] text-muted">What a typical {selected.includes('-') ? 'disc' : 'vertebra'} looks like here</h3>
            <table className="mt-2 w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-rule font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted">
                  <th scope="col" className="py-1 font-normal">Measurement</th>
                  <th scope="col" className="py-1 text-right font-normal">This spine</th>
                  <th scope="col" className="py-1 text-right font-normal">Typical</th>
                  <th scope="col" className="py-1 text-right font-normal">Typical range</th>
                </tr>
              </thead>
              <tbody>
                {d.typicalRows.map((r, k) => (
                  <motion.tr key={r.label} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + k * 0.05 }} className="border-b border-rule">
                    <th scope="row" className="py-1.5 pr-2 font-normal">{r.label}</th>
                    <td className={`py-1.5 ${r.status === 'review' ? 'text-review' : r.status === 'large_deviation' ? 'text-large' : ''}`}><NumberCell value={r.value} unit={r.unit} /></td>
                    <td className="py-1.5"><NumberCell value={r.typical} unit={r.unit} /></td>
                    <td className="whitespace-nowrap py-1.5 text-right font-mono tabular-nums text-muted">{r.low !== null && r.high !== null ? `${r.low.toFixed(1)} to ${r.high.toFixed(1)}` : '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {d.reasons.length > 0 && (
          <>
          <h3 className="mt-5 font-mono text-[0.68rem] font-normal uppercase tracking-[0.14em] text-muted">Why</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {d.reasons.map((r, k) => (
              <motion.li key={r} initial={reduced ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + k * 0.08, duration: 0.45, ease: EASE }} className="border-l-2 border-large/60 pl-3">{r}</motion.li>
            ))}
          </ul>
          </>
        )}
        {d.modelNote && <p className="mt-3 text-sm text-muted">{d.modelNote}</p>}

        <p className="mt-4 text-[0.7rem] text-muted">{d.note}</p>
      </div>
    </motion.div>
  )
}

export function LevelPanel(props: Props) {
  const { selected, statuses, onSelect } = props
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelBody {...props} />
      {/* the list stays mounted across selections so keyboard focus is never lost */}
      <div className={selected ? 'mt-3 h-24 shrink-0' : 'mt-4 min-h-[12rem] flex-1'}>
        <LevelList statuses={statuses} selected={selected} onSelect={onSelect} fill />
      </div>
    </div>
  )
}
