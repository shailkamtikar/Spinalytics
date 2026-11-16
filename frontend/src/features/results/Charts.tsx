import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { Finding } from '../../api/client'
import { Caption, Label, type Status } from '../../components/ui'
import { featureLabel, levelOrder } from './selectors'

const FILL: Record<string, string> = { within: 'var(--within)', review: 'var(--review)', large_deviation: 'var(--large)', missing: 'var(--missing)', no_reference: 'var(--missing)' }
const TICK = { fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }

interface DeviationProps {
  findings: Finding[]
  selectedLevel: string | null
  onSelectLevel: (level: string) => void
  within: number
  large: number
}

/** FIG. 2: z-score by level for one measurement type. The findings table is the text alternative. */
export function DeviationChart({ findings, selectedLevel, onSelectLevel, within, large }: DeviationProps) {
  const features = useMemo(() => [...new Set(findings.filter((f) => f.z_score !== null && f.z_score !== undefined).map((f) => f.feature))], [findings])
  const [feature, setFeature] = useState('vertebral_body_height_anterior_mm')
  const current = features.includes(feature) ? feature : features[0]
  const data = useMemo(
    () =>
      findings
        .filter((f) => f.feature === current && f.z_score !== null && f.z_score !== undefined)
        .sort((a, b) => levelOrder(a.level) - levelOrder(b.level))
        .map((f) => ({ level: f.level, z: Number((f.z_score as number).toFixed(2)), status: f.status })),
    [findings, current],
  )
  if (!current) return <p className="text-sm text-muted">No comparisons with a z-score to chart.</p>
  const lines = [within, -within, large, -large]
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="dev-feature" className="block font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Measurement type</label>
          <select id="dev-feature" value={current} onChange={(e) => setFeature(e.target.value)} className="mt-1 max-w-xs rounded-sm border border-rule bg-surface px-2 py-1.5">
            {features.map((f) => (
              <option key={f} value={f}>{featureLabel({ feature: f, unit: '' })}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="h-72 w-full" role="img" aria-label={`Bar chart of z-scores by level for ${featureLabel({ feature: current, unit: '' })}. The same numbers are in the findings table.`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis dataKey="level" tick={TICK} interval={0} angle={-60} textAnchor="end" height={48} stroke="var(--rule)" />
            <YAxis tick={TICK} stroke="var(--rule)" width={36} domain={[(min: number) => Math.min(-4, Math.floor(min)), (max: number) => Math.max(4, Math.ceil(max))]} />
            {lines.map((y) => (
              <ReferenceLine key={y} y={y} stroke={Math.abs(y) === within ? 'var(--muted)' : 'var(--large)'} strokeDasharray="4 4" />
            ))}
            <ReferenceLine y={0} stroke="var(--rule)" />
            <Bar dataKey="z" isAnimationActive={false} onClick={(d) => onSelectLevel((d as unknown as { level: string }).level)}>
              {data.map((d) => (
                <Cell key={d.level} fill={FILL[d.status]} fillOpacity={selectedLevel && selectedLevel !== d.level ? 0.45 : 1} stroke={selectedLevel === d.level ? 'var(--text)' : 'none'} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Caption label="FIG. 2">
        z-score by level (table column z). Dashed lines at ±{within} and ±{large} are demonstration thresholds, non-clinical.
      </Caption>
    </figure>
  )
}

/** FIG. 3: one value against the central 95% interval and quartiles of its reference group. */
export function ReferenceChart({ finding }: { finding: Finding | undefined }) {
  if (!finding || !finding.reference || finding.value === null || finding.value === undefined) {
    return <p className="text-sm text-muted">Select a row with a value to see it against its reference.</p>
  }
  const r = finding.reference
  const lo = Math.min(r.interval_low, finding.value, r.q1)
  const hi = Math.max(r.interval_high, finding.value, r.q3)
  const pad = (hi - lo) * 0.12 || 1
  const min = lo - pad
  const span = hi + pad - min
  const x = (v: number) => ((v - min) / span) * 560 + 20
  const status = finding.status as Status
  const unit = finding.unit === 'ratio' ? '' : ` ${finding.unit}`
  return (
    <figure>
      <svg viewBox="0 0 600 120" className="w-full" role="img" aria-label={`${featureLabel(finding)} at ${finding.level}: value ${finding.value.toFixed(2)}${unit}; central reference interval ${r.interval_low.toFixed(2)} to ${r.interval_high.toFixed(2)}${unit}.`}>
        <line x1={20} x2={580} y1={70} y2={70} stroke="var(--rule)" />
        <rect x={x(r.interval_low)} y={58} width={x(r.interval_high) - x(r.interval_low)} height={24} fill="var(--surface)" stroke="var(--muted)" />
        <rect x={x(r.q1)} y={58} width={x(r.q3) - x(r.q1)} height={24} fill="var(--accent)" fillOpacity={0.28} stroke="var(--accent)" />
        <line x1={x(r.median)} x2={x(r.median)} y1={54} y2={86} stroke="var(--text)" strokeWidth={2} />
        <line x1={x(finding.value)} x2={x(finding.value)} y1={30} y2={96} stroke={FILL[status]} strokeWidth={3} />
        <circle cx={x(finding.value)} cy={30} r={5} fill={FILL[status]} />
        <text x={x(finding.value)} y={20} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="var(--text)">{finding.value.toFixed(2)}</text>
        <text x={x(r.interval_low)} y={108} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--muted)">{r.interval_low.toFixed(1)}</text>
        <text x={x(r.interval_high)} y={108} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="var(--muted)">{r.interval_high.toFixed(1)}</text>
      </svg>
      <Caption label="FIG. 3">
        {finding.level} · {featureLabel(finding)}{unit}. Pale box: central 95% of the reference group; teal box: quartiles; white line: median; coloured line: this value.
      </Caption>
    </figure>
  )
}

export function ChartLabel() {
  return <Label>Charts</Label>
}
