import type { Finding, ModelResult } from '../../api/client'
import { UNMEASURED } from '../../domain/levels'
import { featureLabel } from './selectors'

export interface TypicalRow {
  label: string
  unit: string
  value: number | null
  typical: number | null
  low: number | null
  high: number | null
  status: string
}

export interface LevelDescription {
  level: string
  measured: boolean
  /** good = within the typical range, attention = something departs from it, unknown = nothing to compare */
  tone: 'good' | 'attention' | 'unknown'
  headline: string
  reasons: string[]
  typicalRows: TypicalRow[]
  modelNote: string | null
  note: string
}

const NOTE = 'This describes the measurements only; it does not identify a cause. The reference group and thresholds are synthetic and non-clinical.'

function fmt(v: number, unit: string): string {
  const digits = unit === 'ratio' ? 3 : 2
  return `${v.toFixed(digits)}${unit === 'ratio' || !unit ? '' : ` ${unit === 'deg' ? '°' : unit}`}`
}

function rarity(f: Finding): string {
  const p = f.percentile
  if (p === null || p === undefined) return ''
  const share = f.z_score! < 0 ? p : 100 - p
  const text = share < 0.5 ? 'fewer than 0.5%' : `about ${share < 10 ? share.toFixed(1) : Math.round(share)}%`
  return ` ${text} of the reference group ${f.z_score! < 0 ? 'is this low or lower' : 'is this high or higher'}.`
}

/** Plain-language meaning of one departing measurement. No cause is named. */
function meaning(f: Finding): string {
  const low = (f.z_score ?? 0) < 0
  switch (f.feature) {
    case 'vertebral_body_wedge_ratio':
      return low ? 'The front of the body is lower than the back compared with the typical shape (more wedge-like).' : 'The front of the body is taller relative to the back than in the typical shape.'
    case 'vertebral_body_lateral_height_difference_mm':
      return 'The left and right sides differ in height more than is typical (a side-to-side tilt of the body).'
    case 'vertebral_body_height_mm':
      return low ? 'The body is lower than typical overall.' : 'The body is taller than typical overall.'
    case 'vertebral_body_width_mm':
      return low ? 'The body is narrower side to side than typical.' : 'The body is wider side to side than typical.'
    case 'vertebral_body_depth_mm':
      return low ? 'The body is shallower front to back than typical.' : 'The body is deeper front to back than typical.'
    case 'disc_height_mm':
      return low ? 'The disc space is narrower than typical.' : 'The disc space is wider than typical.'
    case 'segmental_sagittal_angle_deg':
      return low ? 'The forward/backward bend between these two vertebrae is smaller (or more reversed) than typical.' : 'The forward/backward bend between these two vertebrae is larger than typical.'
    case 'segmental_coronal_angle_deg':
      return 'The sideways angle between these two vertebrae is further from straight than typical.'
    default:
      if (f.feature.startsWith('vertebral_body_height_')) return low ? 'This edge of the body is lower than typical.' : 'This edge of the body is taller than typical.'
      if (f.target_type === 'region') return 'The overall curve of this region differs from the typical curve.'
      return low ? 'The value is lower than typical.' : 'The value is higher than typical.'
  }
}

export function describeLevel(level: string, findings: Finding[], model?: ModelResult): LevelDescription {
  if (UNMEASURED.includes(level)) {
    return { level, measured: false, tone: 'unknown', headline: `${level} is not measured in this version.`, reasons: ['Its body has no comparable measurements in the data, so it is drawn as an outline and never given a status.'], typicalRows: [], modelNote: null, note: NOTE }
  }
  const rows = findings.filter((f) => f.level === level)
  const real = rows.filter((f) => !f.derived)
  const usable = rows.filter((f) => f.status === 'within' || f.status === 'review' || f.status === 'large_deviation')
  const off = usable.filter((f) => f.status !== 'within').sort((a, b) => Math.abs(b.z_score ?? 0) - Math.abs(a.z_score ?? 0))

  const typicalRows: TypicalRow[] = real.map((f) => ({
    label: featureLabel(f), unit: f.unit, value: f.value ?? null, typical: f.reference?.mean ?? null, low: f.reference?.interval_low ?? null, high: f.reference?.interval_high ?? null, status: f.status,
  }))

  const contributor = model?.status === 'ok' ? (model.contributors ?? []).find((c) => c.level === level) : undefined
  const modelNote = contributor ? `The model also ranks this level among the biggest contributors to its score (${contributor.change >= 0 ? '+' : ''}${contributor.change.toFixed(2)}).` : null

  if (usable.length === 0) {
    return { level, measured: true, tone: 'unknown', headline: `No measurements were provided for ${level}, so nothing can be compared.`, reasons: [], typicalRows, modelNote, note: NOTE }
  }
  if (off.length === 0) {
    return { level, measured: true, tone: 'good', headline: `Good: all ${usable.length} comparisons at ${level} are within the typical range for the reference group.`, reasons: [], typicalRows, modelNote, note: NOTE }
  }
  const reasons = off.slice(0, 4).map((f) => {
    const unit = f.unit
    const ref = f.reference
    const diff = f.pct_difference !== null && f.pct_difference !== undefined ? ` (${f.pct_difference > 0 ? '+' : ''}${f.pct_difference.toFixed(0)}%)` : ''
    const compare = ref && f.value !== null && f.value !== undefined ? `${fmt(f.value, unit)} against a typical ${fmt(ref.mean, unit)}${diff}.` : ''
    return `${featureLabel(f)}: ${compare}${rarity(f)} ${meaning(f)}`.replace(/\s+/g, ' ').trim()
  })
  const big = off.filter((f) => f.status === 'large_deviation').length
  return {
    level, measured: true, tone: 'attention',
    headline: `Not within the typical range: ${off.length} of ${usable.length} comparisons at ${level} depart from the reference${big ? `, ${big} of them by a large margin` : ''}.`,
    reasons, typicalRows, modelNote, note: NOTE,
  }
}
