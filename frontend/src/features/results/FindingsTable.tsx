import { useEffect, useMemo, useRef, useState } from 'react'
import type { Finding } from '../../api/client'
import { Caption, NumberCell, StatusBadge, type Status } from '../../components/ui'
import type { Region } from '../../domain/levels'
import { featureLabel, selectFindings, type FindingFilter } from './selectors'

const ALL_STATUSES: Status[] = ['large_deviation', 'review', 'within', 'missing', 'no_reference']
const STATUS_WORD: Record<Status, string> = { within: 'Within reference', review: 'Review', large_deviation: 'Larger deviation', missing: 'Missing', no_reference: 'No reference' }

interface Props {
  findings: Finding[]
  selectedLevel: string | null
  focusColumn: string | null
  onSelect: (finding: Finding) => void
}

export function FindingsTable({ findings, selectedLevel, focusColumn, onSelect }: Props) {
  const [region, setRegion] = useState<Region | 'all'>('all')
  const [sort, setSort] = useState<'z' | 'level'>('z')
  const [statuses, setStatuses] = useState<Set<Status>>(new Set(ALL_STATUSES))
  const filter: FindingFilter = { region, sort, statuses }
  const rows = useMemo(() => selectFindings([...findings], filter), [findings, region, sort, statuses]) // eslint-disable-line react-hooks/exhaustive-deps
  const firstOfLevel = useRef<HTMLTableRowElement | null>(null)
  const scrollBox = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // scroll inside the table box only: the page must stay where the reader clicked
    const row = firstOfLevel.current
    const box = scrollBox.current
    if (row && box) box.scrollTo?.({ top: Math.max(0, row.offsetTop - box.clientHeight / 3), behavior: 'smooth' })
  }, [selectedLevel])

  const toggle = (s: Status) =>
    setStatuses((cur) => {
      const next = new Set(cur)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  let marked = false
  return (
    <figure>
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <label htmlFor="flt-region" className="block font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Region</label>
          <select id="flt-region" value={region} onChange={(e) => setRegion(e.target.value as Region | 'all')} className="mt-1 rounded-sm border border-rule bg-surface px-2 py-1.5">
            <option value="all">All</option>
            <option value="cervical">Cervical</option>
            <option value="thoracic">Thoracic</option>
            <option value="lumbar">Lumbar</option>
          </select>
        </div>
        <div>
          <label htmlFor="flt-sort" className="block font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Sort by</label>
          <select id="flt-sort" value={sort} onChange={(e) => setSort(e.target.value as 'z' | 'level')} className="mt-1 rounded-sm border border-rule bg-surface px-2 py-1.5">
            <option value="z">Largest |z| first</option>
            <option value="level">Spine order</option>
          </select>
        </div>
        <fieldset>
          <legend className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Show</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {ALL_STATUSES.filter((s) => s !== 'no_reference').map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={statuses.has(s)} onChange={() => toggle(s)} className="accent-[var(--accent)]" />
                {STATUS_WORD[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="ml-auto font-mono text-xs text-muted" aria-live="polite">{rows.length} of {findings.length} rows</p>
      </div>

      <div ref={scrollBox} className="relative max-h-[34rem] overflow-auto border border-rule">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm" data-testid="findings-table">
          <thead className="sticky top-0 bg-surface font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted">
            <tr className="border-b border-rule">
              <th scope="col" className="px-3 py-2 font-normal">Level</th>
              <th scope="col" className="px-3 py-2 font-normal">Measurement</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Value</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Reference mean</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Reference interval</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Difference</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Difference %</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">z</th>
              <th scope="col" className="px-3 py-2 text-right font-normal">Percentile</th>
              <th scope="col" className="px-3 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const isLevel = selectedLevel !== null && f.level === selectedLevel
              const ref = !marked && isLevel ? ((marked = true), firstOfLevel) : undefined
              const missing = f.status === 'missing'
              return (
                <tr
                  key={f.column}
                  ref={ref}
                  onClick={() => onSelect(f)}
                  aria-selected={isLevel || undefined}
                  data-level={f.level}
                  data-status={f.status}
                  className={`cursor-pointer border-b border-rule align-top hover:bg-surface ${isLevel ? 'bg-surface' : ''} ${missing ? 'text-muted' : ''} ${focusColumn === f.column ? 'outline outline-1 -outline-offset-1 outline-accent' : ''}`}
                >
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-mono font-normal">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(f) }} className="underline-offset-4 hover:underline" aria-label={`Select ${f.level}, ${featureLabel(f)}`}>
                      {f.level}
                    </button>
                  </th>
                  <td className="px-3 py-1.5">{featureLabel(f)}{f.derived && <span className="ml-1 text-xs text-muted">(derived)</span>}</td>
                  <td className="px-3 py-1.5"><NumberCell value={f.value} unit={f.unit === 'ratio' ? '' : f.unit} digits={f.unit === 'ratio' ? 3 : 2} /></td>
                  <td className="px-3 py-1.5"><NumberCell value={f.reference?.mean} unit={f.unit === 'ratio' ? '' : f.unit} digits={f.unit === 'ratio' ? 3 : 2} /></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                    {f.reference ? `${f.reference.interval_low.toFixed(2)} to ${f.reference.interval_high.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5"><NumberCell value={f.delta} unit={f.unit === 'ratio' ? '' : f.unit} signed digits={f.unit === 'ratio' ? 3 : 2} /></td>
                  <td className="px-3 py-1.5" title={f.pct_difference === null || f.pct_difference === undefined ? (f.value === null ? 'No value was provided' : 'A percentage is not meaningful for angles, ratios or differences') : undefined}>
                    <NumberCell value={f.pct_difference} unit="%" signed digits={1} />
                  </td>
                  <td className="px-3 py-1.5"><NumberCell value={f.z_score} signed digits={2} /></td>
                  <td className="px-3 py-1.5"><NumberCell value={f.percentile} digits={1} /></td>
                  <td className="whitespace-nowrap px-3 py-1.5"><StatusBadge status={f.status as Status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Caption label="TABLE 3">Every comparison returned by the analysis. Reference interval is the central 95% of the synthetic reference group. Click a row to select its level.</Caption>
    </figure>
  )
}
